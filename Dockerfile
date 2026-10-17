FROM node:24-alpine
WORKDIR /app
COPY . .
ENV PORT=3000 DB_FILE=/app/data/labms.db
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
