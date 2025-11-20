# --- STAGE 1: Builder ---
FROM node:20 as builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# --- STAGE 2: Production ---
# Используем 'bullseye' (Debian 11), так как в 'slim' версиях сложно ставить пакеты LibreOffice
FROM node:20-bullseye-slim

# Устанавливаем LibreOffice, Poppler (для работы с PDF) и шрифты
RUN apt-get update && apt-get install -y \
    libreoffice \
    poppler-utils \
    fonts-liberation \
    fonts-dejavu \
    curl \
    unzip \
    && mkdir -p /usr/share/fonts/truetype/google-rubik \
    && curl -L "https://fonts.google.com/download?family=Rubik" -o rubik.zip \
    && unzip rubik.zip -d /usr/share/fonts/truetype/google-rubik \
    && rm rubik.zip \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /usr/src/app .

EXPOSE 3002

CMD [ "npm", "start" ]
