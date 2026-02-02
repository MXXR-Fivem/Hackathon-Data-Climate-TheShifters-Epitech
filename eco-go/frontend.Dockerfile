FROM node:20-alpine

WORKDIR /app

# Installer les dépendances système nécessaires pour Expo
RUN apk add --no-cache git bash

# Installer Expo CLI et ngrok globalement
RUN npm install -g expo-cli @expo/ngrok

# Copier les fichiers package
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste du code
COPY . .

# Exposer les ports Expo
EXPOSE 8082 19003 19004 19005

# Commande de démarrage avec tunnel pour accès mobile
CMD ["npx", "expo", "start", "-c", "--tunnel"]