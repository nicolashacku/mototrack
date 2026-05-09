const express = require('express');
const router = express.Router();
const path = require('path');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

// @route  POST /api/upload/comprobante
// @desc   Subir imagen de comprobante/repuesto
// @access Private
router.post('/comprobante', protect, upload.single('imagen'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen.' });
    }

    // Construir URL pública del archivo
    const protocol = req.protocol;
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
