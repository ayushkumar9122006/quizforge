import Tesseract from 'tesseract.js'

/**
 * Run Tesseract OCR on a base64 data URL or blob URL
 * Returns raw extracted text string
 */
export async function runOcr(imageDataUrl, onProgress) {
  const result = await Tesseract.recognize(imageDataUrl, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100))
      }
    }
  })
  return result.data.text || ''
}
