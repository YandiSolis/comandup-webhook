const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================================
// MEMORIA DEL TURNO (Alcancía virtual)
// ==========================================
let ventasDelDia = 0;
let ticketsAtendidos = 0;

// ==========================================
// 1. OÍDO PARA DOLIBARR (Alertas y sumas)
// ==========================================
app.post('/webhook/alertas', async (req, res) => {
    const datos = req.body;
    console.log("📥 ¡Evento detectado por ComandUp! Código:", datos.triggercode);

    if (datos.triggercode === 'BILL_VALIDATE') {
        const factura = datos.object;
        let mensajeWhatsApp = '';
        let enviarAlerta = false;

        if (factura.type == 2) {
            // Es una cancelación: Restamos de la alcancía
            ventasDelDia -= parseFloat(factura.total_ttc);
            ticketsAtendidos -= 1;
            
            mensajeWhatsApp = `🚨 *ALERTA COMANDUP: CANCELACIÓN* 🚨\nSe ha generado una Nota de Crédito.\nTicket ref: ${factura.ref}\nMonto devuelto: $${factura.total_ttc}`;
            enviarAlerta = true;
        }
        else {
            // Es una venta normal: Sumamos a la alcancía
            ventasDelDia += parseFloat(factura.total_ttc);
            ticketsAtendidos += 1;

            if (factura.remise_percent && parseFloat(factura.remise_percent) >= 15) {
                mensajeWhatsApp = `⚠️ *ALERTA COMANDUP: DESCUENTO ALTO* ⚠️\nSe aplicó un descuento del ${factura.remise_percent}% a una cuenta.\nTicket ref: ${factura.ref}\nTotal cobrado: $${factura.total_ttc}`;
                enviarAlerta = true;
            } else {
                console.log(`✅ Venta normal registrada: $${factura.total_ttc} sumados a la caja.`);
            }
        }

        if (enviarAlerta) {
            try {
                const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: mensajeWhatsApp });
            } catch (error) {
                console.error("❌ Error al enviar WhatsApp:", error.message);
            }
        }
    } 
    else if (datos.triggercode === 'PRODUCT_MODIFY') {
        const producto = datos.object;
        if (producto.status == 0) {
            const mensajeWhatsApp = `🛑 *ALERTA COMANDUP: PRODUCTO AGOTADO (86)* 🛑\nEl platillo *${producto.label}* ha sido marcado como FUERA DE VENTA.`;
            try {
                const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                await axios.post(urlGreenAPI, { chatId: process.env.PHONE_GERENTE, message: mensajeWhatsApp });
            } catch (error) {
                console.error("❌ Error al enviar WhatsApp:", error.message);
            }
        }
    }
    res.status(200).send("Webhook de Dolibarr procesado");
});

// ==========================================
// 2. OÍDO PARA WHATSAPP (El Chatbot)
// ==========================================
app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const webhookData = req.body;

        console.log("🔔 GREENAPI TOCÓ LA PUERTA. Tipo de evento:", webhookData.typeWebhook);

        // Solo procesamos si es un mensaje que entra o que sale
        if (webhookData.typeWebhook === 'incomingMessageReceived' || webhookData.typeWebhook === 'outgoingMessageReceived') {
            
            const messageData = webhookData.messageData || {};
            let mensajeBruto = "";

            // Buscamos el texto en las dos formas en que GreenAPI lo suele esconder
            if (messageData.typeMessage === 'textMessage') {
                mensajeBruto = messageData.textMessageData?.textMessage || "";
            } else if (messageData.typeMessage === 'extendedTextMessage') {
                mensajeBruto = messageData.extendedTextMessageData?.text || "";
            }

            const mensaje = mensajeBruto.trim().toLowerCase();
            const chatId = webhookData.senderData?.chatId;

            console.log(`💬 Texto extraído: "${mensaje}"`);

            if (mensaje === '!reporte') {
                const textoRespuesta = `📊 *CORTE DE CAJA COMANDUP* 📊\n\nHola Gerente, aquí tienes el resumen del turno hasta el momento:\n\n🧾 *Tickets cobrados:* ${ticketsAtendidos}\n💰 *Ventas totales:* $${ventasDelDia.toFixed(2)}\n\n_Tu restaurante está bajo control._`;
                
                const urlGreenAPI = `https://7107.api.greenapi.com/waInstance${process.env.ID_INSTANCE}/sendMessage/${process.env.API_TOKEN_INSTANCE}`;
                
                await axios.post(urlGreenAPI, { chatId: chatId, message: textoRespuesta });
                console.log("✅ Reporte enviado a WhatsApp exitosamente.");
            } else {
                console.log("🙈 El texto no es !reporte o es otro tipo de archivo. Se ignora.");
            }
        }
    } catch (error) {
        console.error("❌ Error leyendo WhatsApp:", error.message);
    }
    
    res.status(200).send("Webhook de GreenAPI procesado");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ComandUp en línea (Puerto ${PORT})`);
});