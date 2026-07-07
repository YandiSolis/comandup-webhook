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

    // Verificamos si Dolibarr mandó un código de evento válido (Validación o Cancelación)
    if (datos.triggercode === 'BILL_VALIDATE' || datos.triggercode === 'BILL_CANCEL' || datos.triggercode === 'ORDER_CANCEL') {
        
        // Armamos el mensaje dinámico
        const mensajeWhatsApp = `⚠️ *Alerta ComandUp* ⚠️\nSe ha detectado un nuevo movimiento en el sistema.\nAcción: ${datos.triggercode}`;

        try {
            // Aquí haces tu petición a GreenAPI con Axios
            const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
            
            const payload = {
                chatId: process.env.PHONE_GERENTE,
                message: mensajeWhatsApp
            };

            await axios.post(urlGreenAPI, payload);
            console.log("✅ Mensaje de WhatsApp enviado correctamente");

        } catch (error) {
            console.error("❌ Error al enviar WhatsApp:", error.message);
        }
    } else {
        console.log("Evento ignorado, no es una cancelación ni validación.");
    }

    // Siempre hay que responderle a Dolibarr para que no se quede colgado
    res.status(200).send("Webhook procesado");
});

// 3. Encendido con host 0.0.0.0 estricto
const PUERTO = process.env.PORT || 8080;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PUERTO}`);
});