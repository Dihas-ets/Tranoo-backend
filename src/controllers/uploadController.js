// backend/uploadController.js
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Création du dossier temporaire
const TMP_DIR = path.join(process.cwd(), 'uploads', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

// Multer
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 Mo max
});

// Middleware pour accepter tous les champs fichiers
exports.videoUploadMiddleware = upload.any();

// Fonction de compression vidéo
function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .size('?x720') // limite hauteur à 720px
      .outputOptions(['-crf 28', '-preset veryfast', '-movflags +faststart'])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

// Upload Cloudinary en streaming
function uploadVideoStream(pathToUpload, folder) {
  return new Promise((resolve, reject) => {
    // Vérifier que le fichier existe
    if (!fs.existsSync(pathToUpload)) {
      return reject(new Error(`Le fichier n'existe pas: ${pathToUpload}`));
    }

    console.log('UPLOAD -> Starting Cloudinary upload stream for:', pathToUpload);
    const fileStats = fs.statSync(pathToUpload);
    console.log('UPLOAD -> File size:', fileStats.size, 'bytes');

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder,
        eager: [
          { quality: 'auto:good', fetch_format: 'auto', width: 1280, crop: 'limit' },
          { quality: 'auto:good', fetch_format: 'auto', width: 480, crop: 'limit', format: 'jpg', start_offset: '1' },
        ],
        eager_async: false,
        timeout: 300000, // 5 minutes max pour gros fichiers
      },
      (error, result) => {
        if (error) {
          console.error('UPLOAD -> Cloudinary upload error:', error);
          return reject(error);
        }
        console.log('UPLOAD -> Cloudinary upload success:', {
          public_id: result?.public_id,
          bytes: result?.bytes,
          secure_url: result?.secure_url ? 'present' : 'missing'
        });
        return resolve(result);
      }
    );

    // Créer le stream de lecture avec gestion d'erreur
    const readStream = fs.createReadStream(pathToUpload);
    
    readStream.on('error', (err) => {
      console.error('UPLOAD -> File read stream error:', err);
      reject(new Error(`Erreur lecture fichier: ${err.message}`));
    });

    stream.on('error', (err) => {
      console.error('UPLOAD -> Cloudinary stream error:', err);
      readStream.destroy(); // Arrêter le stream de lecture
      reject(new Error(`Erreur stream Cloudinary: ${err.message}`));
    });

    readStream.on('open', () => {
      console.log('UPLOAD -> File stream opened, piping to Cloudinary...');
    });

    readStream.on('end', () => {
      console.log('UPLOAD -> File stream ended, waiting for Cloudinary response...');
    });

    readStream.pipe(stream);
  });
}

// Controller principal
exports.uploadAndTranscodeVideo = async (req, res) => {
  console.log('---- UPLOAD VIDEO ----');
  console.log('FILES:', JSON.stringify(req.files, null, 2));
  console.log('BODY:', JSON.stringify(req.body, null, 2));

  const videoFile =
    Array.isArray(req.files) && req.files.length > 0
      ? req.files.find((f) => f.fieldname === 'video') || req.files[0]
      : null;

  console.log('UPLOAD -> videoFile found:', videoFile ? 'YES' : 'NO');
  if (videoFile) {
    console.log('UPLOAD -> videoFile details:', {
      fieldname: videoFile.fieldname,
      originalname: videoFile.originalname,
      path: videoFile.path,
      size: videoFile.size,
      mimetype: videoFile.mimetype
    });
  }

  if (!videoFile) {
    console.error('UPLOAD -> ERROR: No video file found in req.files');
    return res.status(400).json({ 
      error: true,
      message: 'Aucun fichier envoyé',
      receivedFiles: req.files || []
    });
  }

  const inputPath = videoFile.path;
  const compressedPath = `${inputPath}-compressed.mp4`;

  // Vérifier que le fichier existe
  if (!fs.existsSync(inputPath)) {
    console.error('UPLOAD -> ERROR: Input file does not exist:', inputPath);
    return res.status(500).json({
      error: true,
      message: 'Le fichier uploadé n\'existe pas sur le serveur',
      path: inputPath
    });
  }

  try {
    const folder = req.body?.folder || 'tranoo/vehicules/videos';
    console.log('UPLOAD -> folder:', folder, 'name:', videoFile.originalname, 'size:', videoFile.size);

    // Compression si >50Mo
    let pathToUpload = inputPath;
    if (videoFile.size > 50 * 1024 * 1024) {
      console.log('UPLOAD -> compression start (mandatory)');
      try {
        await compressVideo(inputPath, compressedPath);
        pathToUpload = compressedPath;
        console.log('UPLOAD -> compression done:', compressedPath);
        
        // Vérifier que le fichier compressé existe
        if (!fs.existsSync(compressedPath)) {
          throw new Error('Le fichier compressé n\'a pas été créé');
        }
      } catch (compressionErr) {
        console.error('UPLOAD -> compression failed:', compressionErr);
        return res.status(500).json({
          error: true,
          message: 'Compression vidéo échouée',
          details: compressionErr?.message || compressionErr,
        });
      }
    } else {
      console.log('UPLOAD -> No compression needed (file < 50MB)');
    }

    console.log('UPLOAD -> Starting Cloudinary upload for:', pathToUpload);
    const result = await uploadVideoStream(pathToUpload, folder);
    console.log('UPLOAD -> Cloudinary result received:', {
      public_id: result?.public_id,
      has_secure_url: !!result?.secure_url,
      has_eager: !!result?.eager,
      eager_count: result?.eager?.length || 0
    });

    const url = result?.secure_url || '';
    const optimizedUrl = result?.eager?.[0]?.secure_url || url;
    const thumbnail = result?.eager?.[1]?.secure_url || '';

    console.log('UPLOAD -> SUCCESS - Returning response');
    const responseData = {
      url,
      optimizedUrl,
      thumbnail,
      public_id: result?.public_id || '',
      bytes: result?.bytes || 0,
      duration: result?.duration || 0,
      format: result?.format || '',
    };
    console.log('UPLOAD -> Response data:', JSON.stringify(responseData, null, 2));
    
    // Envoyer la réponse
    return res.status(200).json(responseData);

  } catch (err) {
    console.error('UPLOAD VIDEO ERROR:', err);
    console.error('UPLOAD VIDEO ERROR stack:', err?.stack);
    console.error('UPLOAD VIDEO ERROR details:', {
      message: err?.message,
      http_code: err?.http_code,
      error: err?.error,
      name: err?.name
    });
    
    res.status(err?.http_code || 500).json({
      error: true,
      message: err?.message || 'Erreur lors de l\'upload vidéo',
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
      cloudinary: err?.error || undefined,
      http_code: err?.http_code || undefined,
    });
  } finally {
    // Nettoyage des fichiers temporaires
    try {
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
        console.log('UPLOAD -> Cleaned up input file:', inputPath);
      }
    } catch (cleanupErr) {
      console.error('UPLOAD -> Error cleaning up input file:', cleanupErr);
    }
    
    try {
      if (fs.existsSync(compressedPath)) {
        fs.unlinkSync(compressedPath);
        console.log('UPLOAD -> Cleaned up compressed file:', compressedPath);
      }
    } catch (cleanupErr) {
      console.error('UPLOAD -> Error cleaning up compressed file:', cleanupErr);
    }
  }
};
