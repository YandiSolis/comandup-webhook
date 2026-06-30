require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
// Permite que el servidor entienda datos en formato JSON
app.use(express.json()); 

// Esta es la ruta o "puerta" que Dolibarr tocará cuando pase algo
app.post('/webhook/alertas', (req, res) => {
    const datosRecibidos = req.body;
    
    console.log('🚨 ¡ALERTA COMANDUP! Nueva actividad detectada en el ERP:');
    console.log(datosRecibidos);

    // TODO para Eduardo: 
    // 1. Filtrar si la alerta es una cancelación de ticket.
    // 2. Usar axios para disparar el mensaje de WhatsApp.

    // Siempre debemos responderle al ERP que recibimos el mensaje
    res.status(200).send('Webhook recibido correctamente por el servidor Node');
});

// Encendemos el servidor en el puerto 3000
const PUERTO = 3000;
app.listen(PUERTO, () => {
    console.log(`🚀 Servidor Webhook encendido y escuchando en el puerto ${PUERTO}`);
});