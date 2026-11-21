import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

export const INSTAGRAM_OPEN = 'elsewhere:instagram:open'
let opening = false
export async function openInstagramWindow(){
  if(!isTauri()){
    window.open('/?instagram-inbox=1','_blank','width=800,height=650')
    return
  }
  if (getCurrentWindow().label !== 'main' || opening) return
  opening=true
  try{
    const existing=await WebviewWindow.getByLabel('instagram-inbox')
    if(existing){await existing.unminimize();await existing.setFocus();return}
    const w=new WebviewWindow('instagram-inbox',{
      url:'index.html?instagram-inbox=1',title:'Elsewhere Messenger · Instagram',
      width:790,height:640,minWidth:650,minHeight:450,center:true,
      resizable:true,decorations:true,focus:true,skipTaskbar:false,
    })
    await new Promise<void>((resolve,reject)=>{
      void w.once('tauri://created',()=>resolve())
      void w.once('tauri://error',event=>reject(new Error(String(event.payload))))
    })
  }finally{opening=false}
}
