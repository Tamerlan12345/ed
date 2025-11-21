const JSZip = require('jszip');
const xml2js = require('xml2js');

/**
 * Extracts text content from a PPTX buffer by parsing slide XMLs.
 * @param {Buffer} buffer - The PPTX file buffer.
 * @returns {Promise<string>} - The extracted text.
 */
async function extractTextFromPptx(buffer) {
    try {
        const zip = await JSZip.loadAsync(buffer);
        const slideFiles = Object.keys(zip.files).filter(fileName =>
            fileName.startsWith('ppt/slides/slide') && fileName.endsWith('.xml')
        );

        // Sort slides naturally (slide1, slide2, slide10, etc.)
        slideFiles.sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/)[1]);
            const numB = parseInt(b.match(/slide(\d+)\.xml/)[1]);
            return numA - numB;
        });

        let fullText = '';
        const parser = new xml2js.Parser();

        for (const fileName of slideFiles) {
            const slideXml = await zip.file(fileName).async('string');
            const result = await parser.parseStringPromise(slideXml);

            // Helper function to recursively extract text from the parsed object
            const extractTextRecursive = (obj) => {
                let text = '';
                if (typeof obj === 'string') {
                    return obj;
                }
                if (Array.isArray(obj)) {
                    obj.forEach(item => {
                        text += extractTextRecursive(item) + ' ';
                    });
                } else if (typeof obj === 'object' && obj !== null) {
                    // Specific check for <a:t> tags which hold the text in PPTX
                    if (obj['a:t']) {
                         text += extractTextRecursive(obj['a:t']) + ' ';
                    } else {
                        Object.keys(obj).forEach(key => {
                            if (key !== '$') { // Skip attributes
                                text += extractTextRecursive(obj[key]) + ' ';
                            }
                        });
                    }
                }
                return text;
            };

            const slideText = extractTextRecursive(result);
            // Clean up whitespace
            fullText += slideText.replace(/\s+/g, ' ').trim() + '\n\n';
        }

        return fullText.trim();
    } catch (error) {
        console.error('Error extracting text from PPTX:', error);
        throw new Error('Failed to parse PPTX structure for text extraction.');
    }
}

/**
* Парсит PPTX буфер и возвращает массив объектов слайдов с HTML контентом.
* Пытается сохранить изображения и верстку.
*/
async function parsePptxToHtml(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const parser = new xml2js.Parser();
    const slides = [];
    const mediaFiles = {};

    // 1. Извлекаем медиа-файлы (картинки)
    // PPTX хранит картинки в папке ppt/media/
    const mediaFolder = zip.folder("ppt/media");
    if (mediaFolder) {
        // Since forEach is synchronous in JSZip but we need async content extraction,
        // we collect promises.
        const mediaPromises = [];
        mediaFolder.forEach((relativePath, file) => {
            mediaPromises.push((async () => {
                const fileData = await file.async("base64");
                const ext = relativePath.split('.').pop();
                const mimeType = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/octet-stream';
                mediaFiles[relativePath] = `data:${mimeType};base64,${fileData}`;
            })());
        });
        await Promise.all(mediaPromises);
    }

    // 2. Определяем размер слайдов
    let slideWidth = 9144000; // Default width (EMU)
    let slideHeight = 6858000; // Default height (EMU)

    if (zip.file('ppt/presentation.xml')) {
        const presXml = await zip.file('ppt/presentation.xml').async('string');
        const presObj = await parser.parseStringPromise(presXml);
        if (presObj['p:presentation'] && presObj['p:presentation']['p:sldSz']) {
            const sldSz = presObj['p:presentation']['p:sldSz'][0]['$'];
            if (sldSz.cx) slideWidth = parseInt(sldSz.cx);
            if (sldSz.cy) slideHeight = parseInt(sldSz.cy);
        }
    }

    // 3. Находим файлы слайдов и связей (rels) для маппинга картинок
    // Файлы слайдов: ppt/slides/slide1.xml
    // Связи слайдов: ppt/slides/_rels/slide1.xml.rels
    const slideFiles = Object.keys(zip.files).filter(fileName =>
        fileName.match(/^ppt\/slides\/slide\d+\.xml$/)
    ).sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)[1]);
        const numB = parseInt(b.match(/slide(\d+)\.xml/)[1]);
       return numA - numB;
    });

    for (let i = 0; i < slideFiles.length; i++) {
        const fileName = slideFiles[i];
        const slideNumber = i + 1;

        // Получаем XML слайда
        const slideXmlContent = await zip.file(fileName).async('string');
        const slideObj = await parser.parseStringPromise(slideXmlContent);

        // Получаем связи (rels) для этого слайда, чтобы найти ID картинок
        const relsFileName = fileName.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
        const relMap = {}; // Map: rId -> Target (path to media)

        if (zip.file(relsFileName)) {
            const relsXmlContent = await zip.file(relsFileName).async('string');
            const relsObj = await parser.parseStringPromise(relsXmlContent);
            if (relsObj.Relationships && relsObj.Relationships.Relationship) {
                relsObj.Relationships.Relationship.forEach(rel => {
                    const attr = rel['$'];
                    // Target обычно выглядит как "../media/image1.png"
                    const target = attr.Target.replace('../media/', '');
                    relMap[attr.Id] = target;
                });
            }
        }

        const slideHtml = await processSlide(slideObj, slideWidth, slideHeight, relMap, mediaFiles);

        slides.push({
            slide_title: `Слайд ${slideNumber}`,
            html_content: slideHtml
        });
    }

    return slides;
}

async function processSlide(slideObj, slideWidth, slideHeight, relMap, mediaFiles) {
    // Конвертация EMU в пиксели (приближенно для веба, 96 DPI)
    // 1 inch = 914400 EMU = 96 px
    // Scale factor: уменьшаем огромные размеры PPTX до разумных CSS пикселей
    // Допустим, ширина слайда будет 100% контейнера, но для позиционирования используем проценты.

    const aspectRatioPct = (slideHeight / slideWidth) * 100;

    // Базовый контейнер слайда. overflow: hidden важно, чтобы скрыть элементы за краями.
    let html = `<div class="ppt-slide" style="position: relative; width: 100%; padding-bottom: ${aspectRatioPct}%; background-color: #fff; overflow: hidden; border: 1px solid #eee;">`;
    // Внутренний контейнер для абсолютного позиционирования элементов
    html += `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">`;

    const spTree = slideObj['p:sld']['p:cSld'][0]['p:spTree'][0];

    // Функция для рекурсивного обхода групп фигур
    const processShapesRecursively = async (container) => {
        let shapesHtml = '';

        // 1. Обычные фигуры (текстовые блоки, прямоугольники)
        if (container['p:sp']) {
            for (const sp of container['p:sp']) {
                shapesHtml += await processShape(sp, slideWidth, slideHeight);
            }
        }

        // 2. Изображения (p:pic)
        if (container['p:pic']) {
            for (const pic of container['p:pic']) {
                shapesHtml += await processPicture(pic, slideWidth, slideHeight, relMap, mediaFiles);
            }
        }

        // 3. Группы фигур (p:grpSp)
        if (container['p:grpSp']) {
            for (const grp of container['p:grpSp']) {
                // TODO: Обработка трансформаций группы (пока рекурсивно берем элементы как есть)
                shapesHtml += await processShapesRecursively(grp);
            }
        }

        return shapesHtml;
    };

    html += await processShapesRecursively(spTree);
    html += `</div></div>`;
    return html;
}

async function processPicture(pic, slideWidth, slideHeight, relMap, mediaFiles) {
    try {
        const blipFill = pic['p:blipFill'];
        if (!blipFill || !blipFill[0]['a:blip']) return '';

       const embedId = blipFill[0]['a:blip'][0]['$']['r:embed'];
        const imageName = relMap[embedId];
        const base64Image = mediaFiles[imageName];

        if (!base64Image) return '';

        const spPr = pic['p:spPr'][0];
        const xfrm = spPr['a:xfrm'][0];
        const off = xfrm['a:off'][0]['$'];
        const ext = xfrm['a:ext'][0]['$'];

        const xEmu = parseInt(off.x);
        const yEmu = parseInt(off.y);
        const wEmu = parseInt(ext.cx);
        const hEmu = parseInt(ext.cy);

        const leftPct = (xEmu / slideWidth) * 100;
        const topPct = (yEmu / slideHeight) * 100;
        const widthPct = (wEmu / slideWidth) * 100;
        const heightPct = (hEmu / slideHeight) * 100;

        return `<img src="${base64Image}" style="position: absolute; left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%; object-fit: contain; z-index: 1;" />`;
    } catch (e) {
        console.warn("Error processing picture:", e);
        return '';
    }
}

async function processShape(sp, slideWidth, slideHeight) {
    // 1. Позиционирование
    const spPr = sp['p:spPr'];
    if (!spPr || !spPr[0]['a:xfrm']) return '';

    const xfrm = spPr[0]['a:xfrm'][0];
    const off = xfrm['a:off'][0]['$'];
    const ext = xfrm['a:ext'][0]['$'];

    const xEmu = parseInt(off.x);
    const yEmu = parseInt(off.y);
    const wEmu = parseInt(ext.cx);
    const hEmu = parseInt(ext.cy);

    const leftPct = (xEmu / slideWidth) * 100;
    const topPct = (yEmu / slideHeight) * 100;
    const widthPct = (wEmu / slideWidth) * 100;
    const heightPct = (hEmu / slideHeight) * 100;

    // 2. Извлечение текста
    const txBody = sp['p:txBody'];
    if (!txBody) {
        // Это может быть просто фигура (прямоугольник), проверим заливку
        // Если нужно рисовать цветные блоки - можно добавить логику здесь
        return '';
    }

    let paragraphHtml = '';
    const paragraphs = txBody[0]['a:p'];

    if (paragraphs) {
        for (const p of paragraphs) {
            let pContent = '';
            let textAlign = 'left';

            if (p['a:pPr'] && p['a:pPr'][0]['$'] && p['a:pPr'][0]['$'].algn) {
                const algn = p['a:pPr'][0]['$'].algn;
                if (algn === 'ctr') textAlign = 'center';
                if (algn === 'r') textAlign = 'right';
                if (algn === 'j') textAlign = 'justify';
            }

            const runs = p['a:r'];
            if (runs) {
                for (const r of runs) {
                    const t = r['a:t'];
                    if (t) {
                        let text = typeof t[0] === 'string' ? t[0] : (t[0]._ || '');

                        let rStyle = '';
                        if (r['a:rPr']) {
                            const rPr = r['a:rPr'][0];
                            if (rPr['$']) {
                                if (rPr['$'].b === '1') rStyle += 'font-weight: bold;';
                                if (rPr['$'].i === '1') rStyle += 'font-style: italic;';
                                if (rPr['$'].u === 'sng') rStyle += 'text-decoration: underline;';

                                // Размер шрифта
                                if (rPr['$'].sz) {
                                    // sz in hundredths of a point
                                    const sizePt = parseInt(rPr['$'].sz) / 100;
                                    // Адаптация под размер контейнера.
                                    // Грубая эвристика: слайд ~10 дюймов шириной.
                                    // Лучше использовать 'em' относительно высоты контейнера или vw,
                                    // но px проще. Чтобы текст масштабировался, используем clamp или %?
                                    // Попробуем 'container query' единицы cqw, если поддерживается,
                                    // или просто оставим px, так как весь слайд scale-ится через CSS transform в index.html.
                                    rStyle += `font-size: ${sizePt * 1.33}px;`; // pt to px conversion approx
                                }
                            }
                            // Цвет текста
                            if (rPr['a:solidFill']) {
                                let colorHex = '000000';
                                if (rPr['a:solidFill'][0]['a:srgbClr']) {
                                    colorHex = rPr['a:solidFill'][0]['a:srgbClr'][0]['$'].val;
                                } else if (rPr['a:solidFill'][0]['a:schemeClr']) {
                                    // Упрощение: если цвет из схемы, ставим черный или серый
                                    // Чтобы сделать реально 1-в-1, нужно парсить цветовую схему темы (theme1.xml)
                                    colorHex = '333333';
                                }
                                rStyle += `color: #${colorHex};`;
                            }
                        }

                        pContent += `<span style="${rStyle}">${text}</span>`;
                    }
                }
            }

            if (pContent) {
                paragraphHtml += `<p style="margin: 0; text-align: ${textAlign}; white-space: pre-wrap; line-height: 1.2;">${pContent}</p>`;
            } else {
                paragraphHtml += `<p style="margin: 0; height: 1em;">&nbsp;</p>`;
            }
        }
    }

    if (!paragraphHtml) return '';

    return `<div class="ppt-text-box" style="position: absolute; left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%; z-index: 2; overflow: hidden;">${paragraphHtml}</div>`;
}

module.exports = { parsePptxToHtml, extractTextFromPptx };
