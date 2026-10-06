
const express=require("express");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const ExcelJS=require("exceljs");
const ADMIN_USERNAME=process.env.ADMIN_USERNAME||"djole";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"Bojkela123!";

const app=express();
const PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,"data");
const USERS=path.join(DATA,"users.json");
const APPTS=path.join(DATA,"appointments.json");
fs.mkdirSync(DATA,{recursive:true});
function read(file){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return [];}}
function write(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2),"utf8");}
if(!fs.existsSync(USERS))write(USERS,[]);
if(!fs.existsSync(APPTS))write(APPTS,[]);
const sessions=new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

function hash(p){return crypto.createHash("sha256").update(p).digest("hex");}
function auth(req,res,next){
  const t=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  const s=sessions.get(t);
  if(!s||s.expires<Date.now()){sessions.delete(t);return res.status(401).json({error:"Niste prijavljeni."});}
  req.user=s.user;req.role=s.role;req.token=t;next();
}
function adminAuth(req,res,next){
  const t=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  const s=sessions.get(t);
  if(!s||s.expires<Date.now()||s.role!=="admin"){
    if(s && s.expires<Date.now()) sessions.delete(t);
    return res.status(401).json({error:"Admin prijava je potrebna."});
  }
  req.admin=s.user;req.token=t;next();
}

function userAuth(req,res,next){
  if(req.role!=="user") return res.status(403).json({error:"Ova funkcija je dostupna samo korisnicima."});
  next();
}


app.post("/api/register",(req,res)=>{
  const username=String(req.body.username||"").trim();
  const password=String(req.body.password||"");
  if(username.length<3)return res.status(400).json({error:"Korisničko ime mora imati najmanje 3 karaktera."});
  if(password.length<6)return res.status(400).json({error:"Lozinka mora imati najmanje 6 karaktera."});
  const users=read(USERS);
  if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:"Korisničko ime već postoji."});
  users.push({id:crypto.randomUUID(),username,passwordHash:hash(password),createdAt:new Date().toISOString()});
  write(USERS,users);res.json({ok:true});
});

app.post("/api/login",(req,res)=>{
  const username=String(req.body.username||"").trim(),password=String(req.body.password||"");
  if(username.toLowerCase()===ADMIN_USERNAME.toLowerCase() && password===ADMIN_PASSWORD){
    const token=crypto.randomBytes(32).toString("hex");
    sessions.set(token,{role:"admin",user:{username:ADMIN_USERNAME},expires:Date.now()+8*60*60*1000});
    return res.json({ok:true,token,username:ADMIN_USERNAME,role:"admin"});
  }
  const user=read(USERS).find(u=>u.username.toLowerCase()===username.toLowerCase()&&u.passwordHash===hash(password));
  if(!user)return res.status(401).json({error:"Pogrešno korisničko ime ili lozinka."});
  const token=crypto.randomBytes(32).toString("hex");
  sessions.set(token,{role:"user",user:{id:user.id,username:user.username},expires:Date.now()+30*24*60*60*1000});
  res.json({ok:true,token,username:user.username});
});
app.post("/api/logout",auth,(req,res)=>{sessions.delete(req.token);res.json({ok:true});});
app.get("/api/me",auth,(req,res)=>res.json({username:req.user.username,role:req.role,id:req.user.id||null}));

app.get("/api/appointments",auth,userAuth,(req,res)=>{
  res.json(read(APPTS).filter(a=>a.userId===req.user.id).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")));
});
app.get("/api/slots",auth,userAuth,(req,res)=>{
  const date=String(req.query.date||"");
  res.json({booked:read(APPTS).filter(a=>a.date===date&&a.status==="active").map(a=>a.time)});
});

app.post("/api/appointments",auth,userAuth,(req,res)=>{
  const service=String(req.body.service||""),date=String(req.body.date||""),time=String(req.body.time||"");
  if(!["Obično šišanje","Fejd","French crop"].includes(service))return res.status(400).json({error:"Nepoznata usluga."});
  const target=new Date(`${date}T${time}:00`),now=new Date(),start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+14);
  if(isNaN(target)||target<now||target>=end)return res.status(400).json({error:"Termin mora biti u narednih 14 dana."});
  const all=read(APPTS);
  if(all.some(a=>a.userId===req.user.id&&a.status==="active"))return res.status(409).json({error:"Već imate jedan aktivan termin."});
  if(all.some(a=>a.date===date&&a.time===time&&a.status==="active"))return res.status(409).json({error:"Ovaj termin je upravo zauzet."});
  all.push({id:crypto.randomUUID(),userId:req.user.id,service,barber:"Đole",date,time,status:"active",createdAt:new Date().toISOString()});
  write(APPTS,all);res.json({ok:true});
});

app.post("/api/appointments/:id/cancel",auth,userAuth,(req,res)=>{
  const all=read(APPTS),a=all.find(x=>x.id===req.params.id&&x.userId===req.user.id);
  if(!a||a.status!=="active")return res.status(404).json({error:"Termin nije pronađen."});
  const target=new Date(`${a.date}T${a.time}:00`);
  if((target-Date.now())/3600000<12)return res.status(403).json({error:"Otkazivanje nije moguće manje od 12 sati pre termina. Za hitne slučajeve pozovite 067 67 67 67."});
  a.status="cancelled";a.cancelledAt=new Date().toISOString();write(APPTS,all);res.json({ok:true});
});

app.get("/api/admin/appointments",adminAuth,(req,res)=>{
  const users=read(USERS), all=read(APPTS);
  const out=all.map(a=>{
    const u=users.find(x=>x.id===a.userId);
    return {...a,username:u?.username||"Nepoznat korisnik"};
  }).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  res.json(out);
});

app.get("/api/admin/export-month",adminAuth,async(req,res)=>{
  const now=new Date();
  const year=Number(req.query.year)||now.getFullYear();
  const month=(Number(req.query.month)||now.getMonth()+1);
  const prefix=`${year}-${String(month).padStart(2,"0")}-`;
  const users=read(USERS), all=read(APPTS).filter(a=>a.date.startsWith(prefix));
  const rows=all.map(a=>{
    const u=users.find(x=>x.id===a.userId);
    return {
      date:a.date,time:a.time,username:u?.username||"Nepoznat korisnik",
      service:a.service,barber:a.barber,status:a.status,createdAt:a.createdAt||""
    };
  }).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const wb=new ExcelJS.Workbook();
  wb.creator="Bojkela Barber";
  wb.created=new Date();
  const ws=wb.addWorksheet(`Zakazivanja ${String(month).padStart(2,"0")}`);
  ws.columns=[
    {header:"Datum",key:"date",width:14},
    {header:"Vreme",key:"time",width:10},
    {header:"Korisničko ime",key:"username",width:24},
    {header:"Usluga",key:"service",width:22},
    {header:"Barber",key:"barber",width:14},
    {header:"Status",key:"status",width:14},
    {header:"Kreirano",key:"createdAt",width:24}
  ];
  rows.forEach(r=>ws.addRow(r));
  ws.getRow(1).font={bold:true};
  ws.freezePanes={row:2};
  ws.autoFilter="A1:G1";
  ws.eachRow(row=>row.alignment={vertical:"middle"});
  ws.getColumn("date").numFmt="yyyy-mm-dd";
  const filename=`Bojkela_Barber_Zakazivanja_${year}_${String(month).padStart(2,"0")}.xlsx`;
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition",`attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

app.post("/api/admin/appointments/:id/cancel",adminAuth,(req,res)=>{
  const all=read(APPTS), a=all.find(x=>x.id===req.params.id);
  if(!a) return res.status(404).json({error:"Termin nije pronađen."});
  if(a.status!=="active") return res.status(400).json({error:"Termin više nije aktivan."});
  a.status="cancelled";a.cancelledAt=new Date().toISOString();
  write(APPTS,all);res.json({ok:true});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Bojkela Barber radi na http://localhost:${PORT}`));
