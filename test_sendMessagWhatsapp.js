const axios = require("axios");


const ACCESS_TOKEN = "EAAe5nFDeVCoBRoGSxBRWFMFymHMvlzkTnliZCTm4Xj1ou6aTEUhPRxotGENd6JGRNE3bn8rtfnRE2xXpfKjVkVqOSaPIJKhf7GuVGaZC0ow1V2nLFmatJZCvoEXyw9nWPRzjtcAXaw45lVs7pBpgM3wDdQ4xRFi3ZBeLGiaE4USMMGz2vTu7BMVpNfjzkZBZAz1AZDZD";  
const PHONE_NUMBER_ID = 1019497624570675;


console.log("ACCESS_TOKEN:", ACCESS_TOKEN);
console.log("PHONE_NUMBER_ID:", PHONE_NUMBER_ID);

async function sendMessage() {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: "2290197385788",
        type: "template",
        template: {
          name: "hello_world",
          language: {
            code: "en_US"
          },
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(response.data);
  } catch (error) {
    console.log(error.response?.data || error.message);
  }
}

return sendMessage();
