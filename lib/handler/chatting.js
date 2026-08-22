import crypto from "node:crypto";
import { readRepoJson, writeRepoJson, readDatabase } from "../_github.js";
import { verifyUserToken } from "../_auth.js";
import { verifyAdminToken } from "../_admin.js";

const PATH = "data/chatting.json";
function userSession(req){ const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,""); return verifyUserToken(token); }
function adminSession(req){ const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,""); return verifyAdminToken(token); }
function ensureStore(data){ data ||= {}; data.conversations ||= {}; return data; }
function key(email){ return String(email||"").trim().toLowerCase(); }
function cleanMessage(m){ return { id:m.id, sender:m.sender, senderName:m.senderName, text:m.text, createdAt:m.createdAt, readByUser:!!m.readByUser, readByAdmin:!!m.readByAdmin }; }

export default async function handler(req,res){
  try{
    if(req.method!=="GET" && req.method!=="POST" && req.method!=="PATCH") return res.status(405).json({success:false,message:"Method tidak diizinkan."});
    const {data,sha}=await readRepoJson(PATH); const store=ensureStore(data);
    if(req.method==="GET"){
      const admin=adminSession(req);
      if(admin){
        const db=await readDatabase();
        const users=Array.isArray(db.database?.users)?db.database.users:[];
        const keys=new Set(users.map(u=>key(u.email)).filter(Boolean));
        Object.keys(store.conversations||{}).forEach(email=>keys.add(key(email)));
        const conversations=Array.from(keys).map(email=>{
          const user=users.find(u=>key(u.email)===email);
          const c=store.conversations[email]||{};
          const messages=(c.messages||[]).map(cleanMessage);
          const last=messages[messages.length-1];
          return {email:user?.email||c.email||email,username:user?.username||c.username||email,messages,updatedAt:c.updatedAt||last?.createdAt||"",unreadByAdmin:messages.filter(m=>!m.readByAdmin && m.sender==="user").length};
        }).sort((a,b)=>{
          const ad=a.updatedAt?new Date(a.updatedAt).getTime():0;
          const bd=b.updatedAt?new Date(b.updatedAt).getTime():0;
          if(bd!==ad)return bd-ad;
          return String(a.username||a.email).localeCompare(String(b.username||b.email));
        });
        return res.status(200).json({success:true,conversations});
      }
      const session=userSession(req); if(!session) return res.status(401).json({success:false,message:"Sesi user tidak valid."});
      const db=await readDatabase(); const user=(db.database.users||[]).find(u=>u.id===session.userId); if(!user) return res.status(404).json({success:false,message:"User tidak ditemukan."});
      const k=key(user.email); const c=store.conversations[k]||{email:user.email,username:user.username,messages:[]}; c.messages=(c.messages||[]).map(cleanMessage);
      let changed=false; c.messages.forEach(m=>{if(m.sender==="admin"&&!m.readByUser){m.readByUser=true;changed=true;}}); if(changed){store.conversations[k]=c; await writeRepoJson(PATH,store,sha,`Mark chat read ${user.username}`);}
      return res.status(200).json({success:true,conversation:c});
    }
    if(req.method==="POST"){
      const session=userSession(req); if(!session) return res.status(401).json({success:false,message:"Sesi user tidak valid."});
      const db=await readDatabase(); const user=(db.database.users||[]).find(u=>u.id===session.userId); if(!user) return res.status(404).json({success:false,message:"User tidak ditemukan."});
      const text=String(req.body?.text||"").trim(); if(!text) return res.status(400).json({success:false,message:"Pesan tidak boleh kosong."}); if(text.length>4000) return res.status(400).json({success:false,message:"Pesan terlalu panjang."});
      const k=key(user.email); const c=store.conversations[k]||{email:user.email,username:user.username,messages:[]}; c.email=user.email; c.username=user.username; c.messages ||= [];
      c.messages.push({id:`chat_${crypto.randomUUID()}`,sender:"user",senderName:user.username,text,createdAt:new Date().toISOString(),readByUser:true,readByAdmin:false}); c.updatedAt=new Date().toISOString(); store.conversations[k]=c;
      await writeRepoJson(PATH,store,sha,`User chat ${user.username}`); return res.status(200).json({success:true,conversation:c});
    }
    const admin=adminSession(req); if(!admin) return res.status(401).json({success:false,message:"Sesi admin tidak valid."});
    const email=key(req.body?.email); const text=String(req.body?.text||"").trim();
    if(!email) return res.status(400).json({success:false,message:"Email user wajib diisi."});
    const db=await readDatabase(); const user=(db.database.users||[]).find(u=>key(u.email)===email); if(!user) return res.status(404).json({success:false,message:"User tidak ditemukan."});
    const c=store.conversations[email]||{email:user.email,username:user.username,messages:[]}; c.email=user.email; c.username=user.username; c.messages ||= [];
    if(String(req.body?.action||"")==="read"){
      let changed=false;
      c.messages.forEach(m=>{if(m.sender==="user" && !m.readByAdmin){m.readByAdmin=true;changed=true;}});
      if(changed) await writeRepoJson(PATH,store,sha,`Admin read chat ${user.username}`);
      return res.status(200).json({success:true,conversation:c});
    }
    if(!text) return res.status(400).json({success:false,message:"Pesan wajib diisi."});
    c.messages.forEach(m=>{if(m.sender==="user")m.readByAdmin=true;});
    c.messages.push({id:`chat_${crypto.randomUUID()}`,sender:"admin",senderName:"ADMIN RYY STORE",text,createdAt:new Date().toISOString(),readByUser:false,readByAdmin:true}); c.updatedAt=new Date().toISOString(); store.conversations[email]=c;
    await writeRepoJson(PATH,store,sha,`Admin chat ${user.username}`); return res.status(200).json({success:true,conversation:c});
  }catch(error){ console.error("Chat error:",error); return res.status(500).json({success:false,message:"Gagal memproses chat."}); }
}
