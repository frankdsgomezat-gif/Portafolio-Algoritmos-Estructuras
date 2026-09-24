const SUPABASE_URL="https://djnpffipwvibbyoweomu.supabase.co";
const SUPABASE_KEY="sb_publishable_984U_OhfmGrbarPO_RfMdg_lPxGUev8";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let currentUser=null,unitsCache=[],weeksCache=[],filesCache=[];
const $=id=>document.getElementById(id);

document.addEventListener("DOMContentLoaded",async()=>{
  bindEvents();
  if(SUPABASE_KEY==="PEGA_AQUI_TU_PUBLISHABLE_KEY"){showConfigWarning();return;}
  const {data}=await supabaseClient.auth.getSession();
  currentUser=data.session?.user||null; updateAdminUI(); await loadPortfolio();
  supabaseClient.auth.onAuthStateChange(async(_e,session)=>{currentUser=session?.user||null;updateAdminUI();await loadPortfolio();});
});
function bindEvents(){
  $("btnLogin").onclick=()=>openModal("loginModal");
  $("btnAddUnit").onclick=()=>openUnitModal();
  $("btnLogout").onclick=logout;
  $("loginForm").onsubmit=login;$("unitForm").onsubmit=saveUnit;$("weekForm").onsubmit=saveWeek;
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  document.querySelectorAll(".modal").forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.add("hidden")});
}
function updateAdminUI(){$("adminBar").classList.toggle("hidden",!currentUser);$("btnLogin").textContent=currentUser?"Administrador ✓":"Administrador";}
function showConfigWarning(){$("unitsContainer").innerHTML='<div class="error-box"><strong>Falta configurar Supabase.</strong><br>Abre <code>js/app.js</code> y reemplaza <code>PEGA_AQUI_TU_PUBLISHABLE_KEY</code> por tu Publishable key.</div>';}
async function loadPortfolio(){
  $("unitsContainer").innerHTML='<div class="loading">Cargando contenido...</div>';
  const [u,w,f]=await Promise.all([
    supabaseClient.from("units").select("*").order("sort_order"),
    supabaseClient.from("weeks").select("*").order("sort_order"),
    supabaseClient.from("files").select("*").order("created_at")
  ]);
  const error=u.error||w.error||f.error;
  if(error){$("unitsContainer").innerHTML='<div class="error-box">No se pudo cargar el portafolio.<br><small>'+escapeHtml(error.message)+'</small></div>';return;}
  unitsCache=u.data||[];weeksCache=w.data||[];filesCache=f.data||[];renderUnits();
}
function renderUnits(){
  if(!unitsCache.length){$("unitsContainer").innerHTML='<div class="loading">Aún no hay unidades creadas.</div>';return;}
  $("unitsContainer").innerHTML=unitsCache.map((unit,i)=>{
    const weeks=weeksCache.filter(w=>w.unit_id===unit.id);
    return `<article class="unit"><div class="unit-number">${String(i+1).padStart(2,"0")}</div>
    <h3>${escapeHtml(unit.name)}</h3><p>${escapeHtml(unit.description||"")}</p>
    ${currentUser?`<div class="unit-admin"><button class="small-btn" onclick="openUnitModal('${unit.id}')">Editar</button><button class="small-btn danger" onclick="deleteUnit('${unit.id}')">Eliminar</button></div>`:""}
    <div class="weeks">${weeks.map(renderWeek).join("")}</div>
    ${currentUser?`<button class="admin-btn add-week" onclick="openWeekModal('','${unit.id}')">+ Agregar semana</button>`:""}</article>`;
  }).join("");
}
function renderWeek(week){
  const files=filesCache.filter(f=>f.week_id===week.id);
  return `<div class="week-card"><span class="week-title">${escapeHtml(week.name)}</span>
  ${currentUser?`<div class="week-actions"><button class="small-btn" onclick="openWeekModal('${week.id}','${week.unit_id}')">Editar</button><button class="small-btn" onclick="chooseFile('${week.id}')">+ Archivo</button><button class="small-btn danger" onclick="deleteWeek('${week.id}')">Eliminar</button><input id="file-${week.id}" class="file-input" type="file" onchange="uploadFile('${week.id}',this.files[0])"></div>`:""}
  <div class="files">${files.length?files.map(renderFile).join(""):'<span class="empty">Sin archivos todavía.</span>'}</div></div>`;
}
function renderFile(file){
  const url=`${SUPABASE_URL}/storage/v1/object/public/portafolio/${file.storage_path.split("/").map(encodeURIComponent).join("/")}`;
  return `<div class="file-row"><a class="file-link" href="${url}" target="_blank" rel="noopener">📎 ${escapeHtml(file.name)}</a>
  ${currentUser?`<button class="small-btn danger" onclick="deleteFile('${file.id}','${escapeJs(file.storage_path)}')">×</button>`:""}</div>`;
}
function chooseFile(id){$(("file-"+id))?.click();}
async function uploadFile(weekId,file){
  if(!currentUser||!file)return;
  const path=`${currentUser.id}/${weekId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const up=await supabaseClient.storage.from("portafolio").upload(path,file,{cacheControl:"3600",upsert:false});
  if(up.error){alert("No se pudo subir: "+up.error.message);return;}
  const db=await supabaseClient.from("files").insert({week_id:weekId,name:file.name,storage_path:path,mime_type:file.type||null,size:file.size,owner_id:currentUser.id});
  if(db.error){await supabaseClient.storage.from("portafolio").remove([path]);alert("No se pudo registrar: "+db.error.message);return;}
  await loadPortfolio();
}
async function deleteFile(id,path){
  if(!currentUser||!confirm("¿Eliminar este archivo?"))return;
  const s=await supabaseClient.storage.from("portafolio").remove([path]);
  if(s.error){alert(s.error.message);return;}
  const d=await supabaseClient.from("files").delete().eq("id",id).eq("owner_id",currentUser.id);
  if(d.error){alert(d.error.message);return;} await loadPortfolio();
}
function openUnitModal(id=""){
  $("unitForm").reset();$("unitId").value=id;
  if(id){const u=unitsCache.find(x=>x.id===id);if(!u)return;$("unitModalTitle").textContent="Editar unidad";$("unitName").value=u.name;$("unitDescription").value=u.description||"";}
  else $("unitModalTitle").textContent="Nueva unidad";
  $("unitMessage").textContent="";openModal("unitModal");
}
async function saveUnit(e){
  e.preventDefault();if(!currentUser)return;
  const id=$("unitId").value,name=$("unitName").value.trim(),description=$("unitDescription").value.trim();let r;
  if(id)r=await supabaseClient.from("units").update({name,description}).eq("id",id).eq("owner_id",currentUser.id);
  else{const order=unitsCache.length?Math.max(...unitsCache.map(x=>+x.sort_order||0))+1:1;r=await supabaseClient.from("units").insert({name,description,sort_order:order,owner_id:currentUser.id});}
  if(r.error){$("unitMessage").textContent=r.error.message;return;}closeModal("unitModal");await loadPortfolio();
}
async function deleteUnit(id){
  if(!currentUser||!confirm("¿Eliminar esta unidad y sus semanas?"))return;
  const r=await supabaseClient.from("units").delete().eq("id",id).eq("owner_id",currentUser.id);
  if(r.error){alert(r.error.message);return;}await loadPortfolio();
}
function openWeekModal(id="",unitId=""){
  $("weekForm").reset();$("weekId").value=id;$("weekUnitId").value=unitId;
  if(id){const w=weeksCache.find(x=>x.id===id);if(!w)return;$("weekModalTitle").textContent="Editar semana";$("weekName").value=w.name;$("weekUnitId").value=w.unit_id;}
  else $("weekModalTitle").textContent="Nueva semana";
  $("weekMessage").textContent="";openModal("weekModal");
}
async function saveWeek(e){
  e.preventDefault();if(!currentUser)return;
  const id=$("weekId").value,unitId=$("weekUnitId").value,name=$("weekName").value.trim();let r;
  if(id)r=await supabaseClient.from("weeks").update({name}).eq("id",id).eq("owner_id",currentUser.id);
  else{const a=weeksCache.filter(x=>x.unit_id===unitId),order=a.length?Math.max(...a.map(x=>+x.sort_order||0))+1:1;r=await supabaseClient.from("weeks").insert({unit_id:unitId,name,sort_order:order,owner_id:currentUser.id});}
  if(r.error){$("weekMessage").textContent=r.error.message;return;}closeModal("weekModal");await loadPortfolio();
}
async function deleteWeek(id){
  if(!currentUser||!confirm("¿Eliminar esta semana y sus archivos?"))return;
  const r=await supabaseClient.from("weeks").delete().eq("id",id).eq("owner_id",currentUser.id);
  if(r.error){alert(r.error.message);return;}await loadPortfolio();
}
async function login(e){
  e.preventDefault();$("loginMessage").textContent="Iniciando sesión...";
  const r=await supabaseClient.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
  if(r.error){$("loginMessage").textContent="No se pudo iniciar sesión: "+r.error.message;return;}
  closeModal("loginModal");$("loginForm").reset();
}
async function logout(){await supabaseClient.auth.signOut();}
function openModal(id){$(id).classList.remove("hidden")}function closeModal(id){$(id).classList.add("hidden")}
function sanitizeFileName(n){return n.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,150)}
function escapeHtml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function escapeJs(v){return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
window.openUnitModal=openUnitModal;window.openWeekModal=openWeekModal;window.deleteUnit=deleteUnit;window.deleteWeek=deleteWeek;window.chooseFile=chooseFile;window.uploadFile=uploadFile;window.deleteFile=deleteFile;
