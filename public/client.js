const socket = io();

// Elementos del DOM
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const generateLinkButton = document.getElementById('generateLink');
const languageSelector = document.getElementById('languageSelector');
const settingsButton = document.getElementById('settingsButton');
const settingsMenu = document.getElementById('settingsMenu');
const toggleMicButton = document.getElementById('toggleMic');
const toggleCameraButton = document.getElementById('toggleCamera');
const endCallButton = document.getElementById('endCall');
const fontFamilySelector = document.getElementById('fontFamily');
const fontSizeInput = document.getElementById('fontSize');
const fontColorInput = document.getElementById('fontColor');
const subtitlesDiv = document.getElementById('subtitles');

// Variables de estado
let localStream;
let isMicActive = true;
let isCameraActive = true;

// Configuración de WebRTC
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

let peerConnection;

// Captura el video y audio del usuario
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;
        console.log('Cámara y micrófono funcionando correctamente');
        setupPeerConnection();
    })
    .catch(error => {
        console.error('Error al acceder a la cámara/micrófono:', error);
        alert('No se pudo acceder a la cámara o al micrófono. Asegúrate de otorgar los permisos necesarios.');
    });

// Configura la conexión WebRTC
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Añade las pistas locales a la conexión
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Maneja la recepción de video remoto
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Maneja los candidatos ICE
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    // Crea una oferta y la envía al otro usuario
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', peerConnection.localDescription);
        })
        .catch(error => console.error('Error al crear la oferta:', error));
}

// Señalización con Socket.io
socket.on('offer', async offer => {
    if (!peerConnection) setupPeerConnection();
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async answer => {
    await peerConnection.setRemoteDescription(answer);
});

socket.on('ice-candidate', candidate => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

// Escuchar subtítulos del servidor
socket.on('subtitles', text => {
    console.log('Subtítulos recibidos:', text);
    subtitlesDiv.textContent = text;
    subtitlesDiv.style.color = '#FFFF00'; // Color amarillo por defecto
    subtitlesDiv.style.fontSize = '48px'; // Tamaño grande por defecto
});

// Escuchar errores de traducción
socket.on('translation-error', message => {
    console.error('Error de traducción:', message);
    subtitlesDiv.textContent = message;
    subtitlesDiv.style.color = 'red'; // Cambiar color para indicar error
});

// Lógica de los botones
generateLinkButton.innerHTML = '🔗'; // Icono de enlace
settingsButton.innerHTML = '⚙️'; // Icono de configuración
toggleMicButton.innerHTML = '🎤'; // Icono de micrófono
toggleCameraButton.innerHTML = '📷'; // Icono de cámara
endCallButton.innerHTML = '📞'; // Icono de finalizar llamada

// Función para alternar el estado de los botones
function toggleButton(button, isActive) {
    if (isActive) {
        button.classList.remove('active');
    } else {
        button.classList.add('active');
    }
}

generateLinkButton.addEventListener('click', () => {
    const roomId = 'sala-unica'; // Puedes usar un ID fijo o generarlo dinámicamente
    const link = `${window.location.href}?room=${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
        alert('Enlace copiado al portapapeles. Compártelo para unirse a la llamada.');
    }).catch(error => {
        console.error('Error al copiar el enlace:', error);
    });
});

settingsButton.addEventListener('click', () => {
    settingsMenu.classList.toggle('hidden');
});

// Cambiar idioma
languageSelector.addEventListener('change', (event) => {
    const selectedLanguage = event.target.value;
    socket.emit('change-language', selectedLanguage);
    console.log('Idioma seleccionado:', selectedLanguage);
});

toggleMicButton.addEventListener('click', () => {
    isMicActive = !isMicActive;
    localStream.getAudioTracks()[0].enabled = isMicActive;
    toggleButton(toggleMicButton, isMicActive);
    console.log('Micrófono', isMicActive ? 'activado' : 'desactivado');

    // Reiniciar el reconocimiento de voz si se activa el micrófono
    if (isMicActive) {
        startRecognition();
    } else {
        recognition.stop();
    }
});

toggleCameraButton.addEventListener('click', () => {
    isCameraActive = !isCameraActive;
    localStream.getVideoTracks()[0].enabled = isCameraActive;
    toggleButton(toggleCameraButton, isCameraActive);
    console.log('Cámara', isCameraActive ? 'activada' : 'desactivada');
});

endCallButton.addEventListener('click', () => {
    window.location.reload();
    console.log('Llamada finalizada');
});

// Configuración del reconocimiento de voz
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'es-ES'; // Configura el idioma
recognition.continuous = true; // Escucha continua
recognition.interimResults = true; // Resultados intermedios

// Función para iniciar el reconocimiento de voz
function startRecognition() {
    if (isMicActive) {
        recognition.start();
        console.log('Reconocimiento de voz iniciado.');
    } else {
        console.log('El micrófono está desactivado. No se puede iniciar el reconocimiento de voz.');
    }
}

// Manejar los resultados de la transcripción
recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
        } else {
            interimTranscript += transcript;
        }
    }

    // Enviar la transcripción final al servidor cuando se complete la frase
    if (finalTranscript.trim() !== '') {
        console.log('Texto transcrito (final):', finalTranscript.trim());
        socket.emit('transcription', { text: finalTranscript.trim(), userId: socket.id });
        finalTranscript = ''; // Reiniciar la transcripción final
    }
};

// Manejar errores
recognition.onerror = (event) => {
    console.error('Error en el reconocimiento de voz:', event.error);

    // Reiniciar el reconocimiento de voz si el error es "no-speech" o "aborted"
    if (event.error === 'no-speech' || event.error === 'aborted') {
        console.log('Reiniciando el reconocimiento de voz...');
        setTimeout(startRecognition, 1000); // Reiniciar después de 1 segundo
    } else if (event.error === 'not-allowed') {
        alert('Por favor, otorga permisos para usar el micrófono.');
    }
};

// Reiniciar el reconocimiento de voz cuando termine
recognition.onend = () => {
    console.log('Reconocimiento de voz finalizado. Reiniciando...');
    setTimeout(startRecognition, 1000); // Reiniciar después de 1 segundo
};

// Iniciar el reconocimiento de voz al cargar la página
startRecognition();