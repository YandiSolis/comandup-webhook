require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// 1. Ruta de prueba visual (Para abrir desde el navegador)
app.get('/', (req, res) => {
    res.send('✅ ¡El servidor de ComandUp está en línea y conectado a internet!');
});

// 2. Ruta de alertas (La que usará Dolibarr)
app.post('/webhook/alertas', async (req, res) => {
    const datos = req.body;
    console.log("📥 ¡Petición recibida en el servidor! Datos:", datos);
    
    if (datos.evento === 'cancelacion_ticket') {
        const urlGreenAPI = `https://api.green-api.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
        
        try {
            await axios.post(urlGreenAPI, {
                chatId: process.env.PHONE_GERENTE,
                message: `🚨 ALERTA COMANDUP: Se ha cancelado el ticket ${datos.id_ticket}. Monto: $${datos.total}. Motivo: ${datos.motivo}`
            });
            console.log('✅ Mensaje de WhatsApp enviado correctamente');
        } catch (error) {
            console.error('❌ Error al enviar WhatsApp:', error.message);
        }
    }

    res.status(200).send('Webhook procesado con éxito');
});

// 3. Encendido con host 0.0.0.0 estricto
const PUERTO = process.env.PORT || 8080;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PUERTO}`);
});