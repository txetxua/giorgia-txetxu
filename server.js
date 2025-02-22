const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Almacenar el idioma seleccionado por cada usuario
const userLanguages = {};

io.on('connection', socket => {
    console.log('Usuario conectado:', socket.id);

    // Configuración de WebRTC
    socket.on('offer', offer => {
        socket.broadcast.emit('offer', offer);
    });

    socket.on('answer', answer => {
        socket.broadcast.emit('answer', answer);
    });

    socket.on('ice-candidate', candidate => {
        socket.broadcast.emit('ice-candidate', candidate);
    });

    // Cambiar idioma de los subtítulos
    socket.on('change-language', language => {
        userLanguages[socket.id] = language;
        console.log(`Idioma cambiado a ${language} para el usuario ${socket.id}`);
    });

    // Procesar la transcripción y traducir el texto
    socket.on('transcription', async data => {
        const { text, userId } = data;
        console.log('Texto recibido para traducción:', text);

        if (!text) {
            console.log('El texto recibido está vacío.');
            return;
        }

        try {
            // Obtener el otro usuario en la sala
            const otherUserId = Array.from(io.sockets.sockets.keys()).find(id => id !== userId);
            if (!otherUserId) {
                console.log('No hay otro usuario en la sala.');
                return;
            }

            // Obtener el idioma del otro usuario
            const targetLanguage = userLanguages[otherUserId] || 'ES';
            console.log(`Traduciendo al idioma: ${targetLanguage}`);

            // Traducir el texto con DeepL
            const translation = await axios.post('https://api.deepl.com/v2/translate', {
                text: [text],
                target_lang: targetLanguage,
            }, {
                headers: {
                    'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            console.log('Respuesta de DeepL:', translation.data);

            // Enviar subtítulos solo al otro usuario
            socket.to(otherUserId).emit('subtitles', translation.data.translations[0].text);
            console.log('Subtítulos enviados al otro usuario:', translation.data.translations[0].text);
        } catch (error) {
            console.error('Error al traducir el texto:', error);

            // Mostrar más detalles del error
            if (error.response) {
                console.error('Respuesta de error de DeepL:', error.response.data);
                console.error('Código de estado:', error.response.status);
            } else if (error.request) {
                console.error('No se recibió respuesta de DeepL:', error.request);
            } else {
                console.error('Error en la configuración de la solicitud:', error.message);
            }

            // Enviar un mensaje de error al cliente
            socket.emit('translation-error', 'Error al traducir el texto. Inténtalo de nuevo.');
        }
    });

    // Limpiar datos al desconectar
    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
        delete userLanguages[socket.id];
    });
});

server.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});