export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function formatTime(s) {
  const val = Number(s) || 0
  if (val <= 0) return '00:00'
  const rounded = Math.round(val)
  const totalSecs = (rounded === 0 && val > 0) ? 1 : Math.max(0, rounded)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatDuration(seconds) {
  const val = Number(seconds) || 0
  if (val <= 0) return '0 sec'
  const rounded = Math.round(val)
  const s = (rounded === 0 && val > 0) ? 1 : Math.max(0, rounded)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  if (mins === 0) {
    return `${secs} sec`
  }
  return `${mins} min ${secs.toString().padStart(2, '0')} sec`
}

export function formatRemainingSeconds(seconds) {
  const val = Number(seconds)
  if (isNaN(val) || val <= 0) return '0'
  const rounded = Math.round(val)
  return String(Math.max(0, rounded))
}

export function cropImage(imgDataUrl, cropPct) {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => {
      const {x,y,w,h} = cropPct
      const sx=(x/100)*img.width, sy=(y/100)*img.height
      const sw=(w/100)*img.width, sh=(h/100)*img.height
      const c = document.createElement('canvas')
      c.width=sw; c.height=sh
      c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,sw,sh)
      res(c.toDataURL('image/jpeg', 0.93))
    }
    img.src = imgDataUrl
  })
}
