FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=4000
ENV DB_PATH=/data/socforge.db
EXPOSE 4000
CMD ["node", "src/index.js"]
