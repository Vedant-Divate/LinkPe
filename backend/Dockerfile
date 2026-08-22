FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY index.js ./

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

USER node
CMD ["npm", "start"]
