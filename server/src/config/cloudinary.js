const cloudinary = require('cloudinary').v2;
const config = require('./env');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

const TRANSFORMS = {
  cover: 'w_1200,h_630,c_fill,q_auto,f_auto',
  avatar: 'w_200,h_200,c_fill,g_face,r_max,q_auto,f_auto',
  thumb: 'w_400,h_250,c_fill,q_auto,f_auto',
};

module.exports = {
  cloudinary,
  TRANSFORMS,
};
