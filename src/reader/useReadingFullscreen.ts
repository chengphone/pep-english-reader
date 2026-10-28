import { useEffect, useRef, useState } from 'react'
export function useReadingFullscreen() {
 const ref=useRef<HTMLElement|null>(null),[expanded,setExpanded]=useState(false)
 useEffect(()=>{const update=()=>{if(!document.fullscreenElement)setExpanded(false)};document.addEventListener('fullscreenchange',update);return()=>{document.removeEventListener('fullscreenchange',update);if(ref.current&&document.fullscreenElement===ref.current)void document.exitFullscreen?.().catch(()=>{})}},[])
 async function toggle(){
  if(expanded){try{if(ref.current&&document.fullscreenElement===ref.current)await document.exitFullscreen()}catch{}setExpanded(false);return}
  try{if(ref.current?.requestFullscreen)await ref.current.requestFullscreen()}catch{/* CSS fullscreen also works where the native API is unavailable. */}
  setExpanded(true)
 }
 async function leave(){try{if(ref.current&&document.fullscreenElement===ref.current)await document.exitFullscreen()}catch{}setExpanded(false)}
 return {ref,expanded,toggle,leave}
}
