const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(base64String, folder, publicId) {
  const result = await cloudinary.uploader.upload(base64String, {
    folder: `eventshub/${folder}`,
    public_id: publicId,
    overwrite: true,
    transformation: [
      { width: 400, height: 400, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
}

async function deleteImage(publicId) {
  return await cloudinary.uploader.destroy(publicId);
}

module.exports = {
  uploadImage,
  deleteImage,
};
