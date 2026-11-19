import React, { useEffect, useRef, useState } from 'react'
import './scene.css'

const initialAngle = -0.61
const wheelCenters = [-1.39, 1.48]
const tau = Math.PI * 2

// A coachbuilt coupé, measured in metres. Sections run from nose to tail.
function buildCoupe() {
  const faces = []
  function panel(color, ...vertices) { faces.push({ color, vertices }) }
  const sections = [
    [-2.39, .72, .66], [-2.28, .88, .81], [-1.88, .98, .90], [-1.4, 1, .96],
    [-.86, .96, .95], [-.51, .94, .98], [.75, .96, 1], [1.46, 1.01, 1.02],
    [1.96, .97, .99], [2.25, .90, .94], [2.32, .83, .86],
  ]
  function sectionAt(x) {
    const i = sections.findIndex(p => p[0] >= x)
    if (i <= 0) return i === 0 ? sections[0] : sections[sections.length - 1]
    const a = sections[i - 1], b = sections[i], t = (x - a[0]) / (b[0] - a[0])
    return [x, a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
  }
  function ring(x) {
    const [, w, h] = sectionAt(x)
    const dist = Math.min(...wheelCenters.map(wx => Math.abs(wx - x)))
    const sill = dist < .44 ? .4 + Math.sqrt(.44 ** 2 - dist ** 2) : .27
    const outline = [[0,h+.017],[.60,h+.03],[.88,h+.006],[.985,h-.064],[1,(h-.064+sill)/2],[.975,sill],[.76,sill-.02]]
    return [...outline.map(([z,y]) => [x,y,w*z]), ...outline.slice(1).reverse().map(([z,y]) => [x,y,-w*z])]
  }
  const xs = [...new Set([...sections.map(s => s[0]), ...wheelCenters.flatMap(wx => Array.from({length:31}, (_,i) => wx+.44*Math.cos(i*Math.PI/30)))])].sort((a,b)=>a-b)
  const palette = ['#345688','#345783','#6283ae','#2c4972','#172c4c','#0a1323','#08101c','#0a1323','#172c4c','#2c4972','#6283ae','#345783','#345688']
  let previous = ring(xs[0])
  for(let j=1;j<7;j++) panel('#213759',previous[j-1],previous[j],previous[13-j],previous[(14-j)%13])
  for (const x of xs.slice(1)) {
    const next = ring(x)
    for (let j=0;j<next.length;j++) {
      const k=(j+1)%next.length
      panel(palette[j],previous[j],next[j],next[k],previous[k])
    }
    previous=next
  }
  for(let j=1;j<7;j++) panel('#263955',previous[j-1],previous[j],previous[13-j],previous[(14-j)%13])
  const cabin = [[-.93,.943,.79],[-.35,1.39,.66],[-.10,1.46,.65],[.58,1.46,.64],[.85,1.39,.66],[1.62,1.01,.82]]
  for (let i=1;i<cabin.length;i++) {
    const [x,y,w]=cabin[i-1], [u,v,d]=cabin[i]
    panel(i===1?'#4a6684':i===5?'#25394e':'#44648b',[x,y,-w],[u,v,-d],[u,v,d],[x,y,w])
    for (const s of [-1,1]) panel(i===1||i===5?'#19283d':'#2b435a',[x,y,w*s],[u,v,d*s],[u,sectionAt(u)[2],.85*s],[x,sectionAt(x)[2],.85*s])
  }
  for (const s of [-1,1]) {
    // Side glass insets leave the roof rails, pillars and frames in the bodywork.
    panel('#0e1a28',[.16,1.003,.855*s],[.23,1.003,.855*s],[.26,1.453,.65*s],[.18,1.453,.65*s])
    panel('#8aa0b1',[-.78,.993,.86*s],[1.34,1.03,.83*s],[1.33,1.043,.83*s],[-.78,1.004,.86*s])
    panel('#0a1424',[-.82,.27,.95*s],[.98,.27,.96*s],[1.02,.34,.964*s],[-.81,.31,.958*s])
    panel('#a9bcce',[.53,.899,.985*s],[.73,.907,.99*s],[.73,.89,.99*s],[.53,.882,.985*s])
    panel('#304d71',[-.54,1.033,.85*s],[-.42,1.05,1.08*s],[-.32,1.105,1.11*s],[-.48,1.13,1.08*s])
    panel('#0e1a2d',[-.54,1.033,.85*s],[-.42,1.05,1.08*s],[-.32,1.105,1.11*s],[-.37,1.036,1.08*s])
    panel('#ecf6ff',[-2.397,.578,.305*s],[-2.397,.597,.677*s],[-2.397,.646,.694*s],[-2.397,.614,.322*s])
    panel('#d73749',[2.329,.78,.23*s],[2.33,.8,.79*s],[2.26,.85,.90*s],[2.33,.837,.785*s],[2.329,.806,.23*s])
  }
  panel('#08121e',[-2.401,.345,-.64],[-2.401,.345,.64],[-2.401,.50,.51],[-2.401,.50,-.51])
  for (const y of [.36,.394,.427,.46]) panel('#334054',[-2.408,y,-.51],[-2.408,y,.51],[-2.408,y+.009,.51],[-2.408,y+.009,-.51])
  for (const x of wheelCenters) for(const side of [-1,1]) {
    const segments=32, centerY=.405
    const at=(radius,angle,offset)=>[x+radius*Math.cos(angle),centerY+radius*Math.sin(angle),side*offset]
    for(let i=0;i<segments;i++){
      const a=tau*i/segments,b=tau*(i+1)/segments
      for(const [r,q,z,v,c] of [[.401,.401,.82,.966,'#0b0e14'],[.401,.373,.966,.99,'#151922'],[.373,.301,.99,.99,'#10141b'],[.301,.283,.99,.993,'#98a1b2'],[.283,.263,.993,.985,'#273140']]) panel(c,at(r,a,z),at(r,b,z),at(q,b,v),at(q,a,v))
      panel('#19202b',at(.265,a,.981),at(.265,b,.981),at(0,0,.981))
    }
    for(let i=0;i<10;i++){
      const a=i*tau/10
      panel('#97a3b5',at(.068,a,.999),at(.277,a+.09,.993),at(.279,a+.165,.993),at(.083,a+.23,.998))
      panel('#4c586b',at(.068,a,.999),at(.277,a-.015,.993),at(.277,a+.085,.993),at(.075,a+.09,.998))
    }
    panel('#9cabc1',...Array.from({length:16},(_,i)=>at(.072,i*tau/16,1.002)))
  }
  return faces
}

// Keep the mesh on the GPU between frames. Only the camera uniform changes on drag.
function createRenderer(canvas, model) {
  const gl = canvas.getContext('webgl', { alpha:true, antialias:true, powerPreference:'low-power' })
  if (!gl) return null
  const program=gl.createProgram()
  if(!program) return null
  const shaders=[]
  const buffer=gl.createBuffer()
  const dispose=()=>{gl.deleteBuffer(buffer);gl.deleteProgram(program);for (const shader of shaders) gl.deleteShader(shader)}
  const sources=[
    [gl.VERTEX_SHADER,`attribute vec3 position, tint;
      uniform vec2 viewport; uniform float angle,zoom;
      varying vec3 color;
      void main(){
        float c=cos(angle),s=sin(angle);
        float side=position.x*c-position.z*s, depth=position.x*s+position.z*c;
        float up=(position.y-.68)*.982004-depth*.188859;
        float d=depth*.982004+(position.y-.68)*.188859, clip=9.-d;
        gl_Position=vec4(side*zoom*18./viewport.x, up*zoom*18./viewport.y-.02*clip,
          clip-12.,clip);
        color=tint;
      }`],
    [gl.FRAGMENT_SHADER,'precision mediump float; varying vec3 color; void main(){gl_FragColor=vec4(color,1.);}']
  ]
  for(const [type,source] of sources) {
    const shader=gl.createShader(type)
    if(!shader){dispose();return null}
    shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader)
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){dispose();return null}
    gl.attachShader(program,shader)
  }
  gl.linkProgram(program)
  if(!buffer||!gl.getProgramParameter(program,gl.LINK_STATUS)){dispose();return null}
  gl.useProgram(program)
  const data=[]
  for(const {color,vertices} of model){
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255)
    for(let j=1;j<vertices.length-1;j++) for(const v of [vertices[0],vertices[j],vertices[j+1]])data.push(...v,...rgb)
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW)
  for(const [name,offset] of [['position',0],['tint',12]]) {
    const loc=gl.getAttribLocation(program,name)
    gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset)
  }
  gl.enable(gl.DEPTH_TEST)
  const viewport=gl.getUniformLocation(program,'viewport'),camera=gl.getUniformLocation(program,'angle'),scale=gl.getUniformLocation(program,'zoom'),count=data.length/6
  return {dispose, paint(w,h,angle,zoom){
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)
    gl.uniform2f(viewport,w,h);gl.uniform1f(camera,angle);gl.uniform1f(scale,zoom)
    gl.drawArrays(gl.TRIANGLES,0,count)
  }}
}

// Project the same faces into a small depth buffer when hardware rendering is unavailable.
function createCanvasRenderer(canvas, model) {
  const ctx=canvas.getContext('2d')
  if (!ctx) return null
  const points=[], indices=new Map(), triangles=[]
  function pointIndex(point) {
    const key=point.join(',')
    if (!indices.has(key)) {indices.set(key,points.length);points.push(point)}
    return indices.get(key)
  }
  for (const {vertices,color} of model) {
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16))
    const mapped=vertices.map(pointIndex)
    for(let j=1;j<mapped.length-1;j++) triangles.push([mapped[0],mapped[j],mapped[j+1],...rgb])
  }
  let bitmap, depth
  return { dispose(){}, paint(w,h,angle,zoom) {
    const width=canvas.width, height=canvas.height
    if (!bitmap || bitmap.width!==width || bitmap.height!==height) {
      bitmap=ctx.createImageData(width,height)
      depth=new Float32Array(width*height)
    }
    bitmap.data.fill(0);depth.fill(0)
    const c=Math.cos(angle),s=Math.sin(angle)
    const projected=points.map(([x,y,z])=>{
      const side=x*c-z*s, forward=x*s+z*c
      const up=(y-.68)*.982004-forward*.188859
      const inverse=1/(9-forward*.982004-(y-.68)*.188859)
      return [(w*.5+side*zoom*9*inverse)*width/w,(h*.51-up*zoom*9*inverse)*height/h,inverse]
    })
    for(const [ia,ib,ic,r,g,b] of triangles) {
      const [ax,ay,az]=projected[ia], [bx,by,bz]=projected[ib], [cx,cy,cz]=projected[ic]
      const determinant=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
      if(Math.abs(determinant)<.0001)continue
      const left=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)), right=Math.min(width-1,Math.floor(Math.max(ax,bx,cx)-.5))
      const top=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)), bottom=Math.min(height-1,Math.floor(Math.max(ay,by,cy)-.5))
      const uX=(by-cy)/determinant, uY=(cx-bx)/determinant, vX=(cy-ay)/determinant, vY=(ax-cx)/determinant
      for(let y=top;y<=bottom;y++){
        let u=uX*(left+.5-cx)+uY*(y+.5-cy),v=vX*(left+.5-cx)+vY*(y+.5-cy)
        for(let x=left;x<=right;x++,u+=uX,v+=vX){
          if(u<0 || v<0 || u+v>1)continue
          const distance=cz+u*(az-cz)+v*(bz-cz), index=y*width+x
          if(distance<=depth[index])continue
          depth[index]=distance
          const pixel=index*4
          bitmap.data[pixel]=r;bitmap.data[pixel+1]=g;bitmap.data[pixel+2]=b;bitmap.data[pixel+3]=255
        }
      }
    }
    ctx.putImageData(bitmap,0,0)
  }}
}

export default function ShowroomScene() {
  const canvas=useRef(null),fallbackCanvas=useRef(null)
  const angle=useRef(initialAngle),draw=useRef(()=>{}),drag=useRef(null)
  const [mode,setMode]=useState('static')
  function rotate(amount){angle.current+=amount;draw.current()}
  useEffect(()=>{
    const gpuCanvas=canvas.current, cpuCanvas=fallbackCanvas.current
    const model=buildCoupe()
    let surface, renderer,frame=0
    const paint=()=>{
      frame=0
      if(!renderer)return
      const w=surface.clientWidth,h=surface.clientHeight
      if(!w||!h)return
      const dpr=Math.min(window.devicePixelRatio||1,1.75,surface===cpuCanvas?800/w:Infinity)
      const width=Math.round(w*dpr),height=Math.round(h*dpr)
      if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height}
      renderer.paint(w,h,angle.current,Math.min(w/5.25,h/2.6))
    }
    const selectRenderer=(allowGPU)=>{
      renderer?.dispose()
      surface=gpuCanvas
      renderer=allowGPU?createRenderer(surface,model):null
      if(!renderer){surface=cpuCanvas;renderer=createCanvasRenderer(surface,model)}
      setMode(renderer?(surface===gpuCanvas?'gpu':'canvas'):'static')
      paint()
    }
    draw.current=()=>{if(!frame)frame=requestAnimationFrame(paint)}
    const lost=e=>{e.preventDefault();selectRenderer(false)}
    const restored=()=>selectRenderer(true)
    gpuCanvas.addEventListener('webglcontextlost',lost)
    gpuCanvas.addEventListener('webglcontextrestored',restored)
    selectRenderer(true)
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(draw.current)
    observer?.observe(gpuCanvas.parentElement)
    window.addEventListener('resize',draw.current)
    return ()=>{gpuCanvas.removeEventListener('webglcontextlost',lost);gpuCanvas.removeEventListener('webglcontextrestored',restored);renderer?.dispose();observer?.disconnect();window.removeEventListener('resize',draw.current);cancelAnimationFrame(frame);draw.current=()=>{}}
  },[])

  return <div className="ynr-scene">
    {mode==='static' && <div className="ynr-scene-fallback" role="img" aria-label="Silhouette de coupé sportif"><i/><b/><b/></div>}
    <div style={{position:'absolute',inset:0,touchAction:'pan-y'}} role="img" aria-label="Étude de style YNR, coupé bleu en trois dimensions" tabIndex={mode==='static'?-1:0}
      onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();rotate(e.key==='ArrowLeft'?-.22:.22)}}}
      onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;drag.current={x:e.clientX,angle:angle.current};e.currentTarget.setPointerCapture(e.pointerId)}}
      onPointerMove={e=>{if(drag.current&&e.isPrimary){angle.current=drag.current.angle-(e.clientX-drag.current.x)*.009;draw.current()}}}
      onLostPointerCapture={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onPointerUp={()=>{drag.current=null}}>
      <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',inset:0,visibility:mode==='gpu'?'visible':'hidden'}}/>
      <canvas ref={fallbackCanvas} aria-hidden="true" style={{position:'absolute',inset:0,visibility:mode==='canvas'?'visible':'hidden'}}/>
    </div>
    {mode!=='static' && <div className="ynr-scene-controls" role="group" aria-label="Rotation du coupé">
      <button type="button" aria-label="Tourner à gauche" onClick={()=>rotate(-.32)}>←</button><span>Vue 360°</span><button type="button" aria-label="Tourner à droite" onClick={()=>rotate(.32)}>→</button>
    </div>}
  </div>
}
