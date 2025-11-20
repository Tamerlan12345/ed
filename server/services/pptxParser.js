const JSZip = require('jszip');
const xml2js = require('xml2js');

async function parsePptxToHtml(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const parser = new xml2js.Parser();
    const slides = [];

    // 1. Determine Slide Size from ppt/presentation.xml
    let slideWidth = 12192000; // Default 16:9 width in EMU
    let slideHeight = 6858000; // Default 16:9 height in EMU

    if (zip.file('ppt/presentation.xml')) {
        const presXml = await zip.file('ppt/presentation.xml').async('string');
        const presObj = await parser.parseStringPromise(presXml);
        if (presObj['p:presentation'] && presObj['p:presentation']['p:sldSz']) {
            const sldSz = presObj['p:presentation']['p:sldSz'][0]['$'];
            if (sldSz.cx) slideWidth = parseInt(sldSz.cx);
            if (sldSz.cy) slideHeight = parseInt(sldSz.cy);
        }
    }

    // 2. Find slides
    const slideFiles = Object.keys(zip.files).filter(fileName =>
        fileName.match(/^ppt\/slides\/slide\d+\.xml$/)
    ).sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)[1]);
        const numB = parseInt(b.match(/slide(\d+)\.xml/)[1]);
        return numA - numB;
    });

    if (slideFiles.length === 0) {
        throw new Error('No slides found in the PPTX file.');
    }

    for (let i = 0; i < slideFiles.length; i++) {
        const fileName = slideFiles[i];
        const slideXmlContent = await zip.file(fileName).async('string');
        const slideObj = await parser.parseStringPromise(slideXmlContent);

        const slideHtml = await processSlide(slideObj, slideWidth, slideHeight);
        slides.push({
            slide_title: `Slide ${i + 1}`,
            html_content: slideHtml
        });
    }

    return slides;
}

async function processSlide(slideObj, slideWidth, slideHeight) {
    // Calculate aspect ratio for padding-bottom
    const aspectRatioPct = (slideHeight / slideWidth) * 100;

    let html = `<div class="slide-container" style="position: relative; width: 100%; padding-bottom: ${aspectRatioPct}%; background-color: #fff; overflow: hidden; border: 1px solid #ddd;">`;

    const spTree = slideObj['p:sld']['p:cSld'][0]['p:spTree'][0];

    // Shapes often contain text
    if (spTree['p:sp']) {
        for (const sp of spTree['p:sp']) {
            const shapeHtml = await processShape(sp, slideWidth, slideHeight);
            html += shapeHtml;
        }
    }

    // Groups might contain shapes
    if (spTree['p:grpSp']) {
        for (const grp of spTree['p:grpSp']) {
             if (grp['p:sp']) {
                 for (const sp of grp['p:sp']) {
                      // Note: We are treating group shapes as top-level for now, ignoring group transforms.
                      // This is a simplification.
                      const shapeHtml = await processShape(sp, slideWidth, slideHeight);
                      html += shapeHtml;
                 }
             }
        }
    }

    html += `</div>`;
    return html;
}

async function processShape(sp, slideWidth, slideHeight) {
    // 1. Extract Text
    const txBody = sp['p:txBody'];
    if (!txBody) return ''; // No text body

    let textContent = '';
    let paragraphHtml = '';

    const paragraphs = txBody[0]['a:p'];
    if (paragraphs) {
        for (const p of paragraphs) {
             let pContent = '';
             let pStyles = [];

             // Paragraph Properties (alignment)
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
                         if (!text) continue;

                         // Run Properties (bold, italic, size, color)
                         let rStyle = '';
                         if (r['a:rPr']) {
                             const rPr = r['a:rPr'][0];
                             if (rPr['$']) {
                                 if (rPr['$'].b === '1') rStyle += 'font-weight: bold;';
                                 if (rPr['$'].i === '1') rStyle += 'font-style: italic;';
                                 if (rPr['$'].u === 'sng') rStyle += 'text-decoration: underline;';

                                 if (rPr['$'].sz) {
                                     // sz is in hundredths of a point.
                                     const sizePt = parseInt(rPr['$'].sz) / 100;
                                     // Use clamping to prevent huge text on small screens or use vw
                                     // A standard slide is ~10 inches wide. 10 inches = 720pt.
                                     // So font size as % of slide width might be robust?
                                     // Slide width in pts is 720 (approx).
                                     // font size 18pt -> 18/720 = 2.5% of width.
                                     // Let's try 'em' or 'rem' or just px. PX is easiest but not responsive.
                                     // Let's convert to % of container width.
                                     // Assume standard width 10in = 960px (approx for web).
                                     // 12192000 EMU = 960px? No.
                                     // Let's stick to pixels but maybe allow CSS to scale the whole container.
                                     // Or use container query units (cqw) if supported, but % is safer.
                                     // Let's just output 'pt' as is, browsers handle pt well enough usually,
                                     // but for a scaled container (transform: scale), px/pt is fine.
                                     rStyle += `font-size: ${sizePt}pt;`;
                                 }
                             }
                             // Color
                             if (rPr['a:solidFill']) {
                                 if (rPr['a:solidFill'][0]['a:srgbClr']) {
                                     const color = rPr['a:solidFill'][0]['a:srgbClr'][0]['$'].val;
                                     rStyle += `color: #${color};`;
                                 } else {
                                     // Default color if using scheme color, maybe black?
                                     // rStyle += `color: #333;`;
                                 }
                             }
                         }

                         pContent += `<span style="${rStyle}">${text}</span>`;
                     }
                 }
             }
             // Only add paragraph if it has content or is a line break
             if (pContent) {
                 paragraphHtml += `<p style="margin: 0; text-align: ${textAlign}; white-space: pre-wrap;">${pContent}</p>`;
             } else {
                 // Empty paragraph (newline)
                 paragraphHtml += `<p style="margin: 0; height: 1em;">&nbsp;</p>`;
             }
        }
    }

    if (!paragraphHtml) return '';

    // 2. Extract Geometry/Layout
    const spPr = sp['p:spPr'];
    if (!spPr) return '';

    const xfrm = spPr[0]['a:xfrm'];
    if (!xfrm) return '';

    const off = xfrm[0]['a:off'][0]['$'];
    const ext = xfrm[0]['a:ext'][0]['$'];

    const xEmu = parseInt(off.x);
    const yEmu = parseInt(off.y);
    const wEmu = parseInt(ext.cx);
    const hEmu = parseInt(ext.cy);

    const leftPct = (xEmu / slideWidth) * 100;
    const topPct = (yEmu / slideHeight) * 100;
    const widthPct = (wEmu / slideWidth) * 100;
    const heightPct = (hEmu / slideHeight) * 100;

    // Style for the text box
    const style = `
        position: absolute;
        left: ${leftPct}%;
        top: ${topPct}%;
        width: ${widthPct}%;
        height: ${heightPct}%;
        z-index: 10;
    `;

    return `<div class="ppt-text-box" style="${style}">${paragraphHtml}</div>`;
}

module.exports = { parsePptxToHtml };
