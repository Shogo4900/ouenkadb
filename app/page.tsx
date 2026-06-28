"use client";

import { useState, useEffect, useCallback } from "react";

const HANYOU_TARGETS = ["捕手","日本人野手","外国人野手","投手","若手","左打者","右打者","外国人投手","野手"];

const TEAM_COLORS: Record<string, string> = {
  "北海道日本ハムファイターズ":"#003087","東北楽天ゴールデンイーグルス":"#8B0000",
  "埼玉西武ライオンズ":"#4169e1","千葉ロッテマリーンズ":"#000080",
  "福岡ソフトバンクホークス":"#c8a200","オリックスバファローズ":"#003087",
  "読売ジャイアンツ":"#cc4400","東京ヤクルトスワローズ":"#006400",
  "中日ドラゴンズ":"#003da5","横浜DeNAベイスターズ":"#003087",
  "阪神タイガース":"#c8a200","広島東洋カープ":"#CC0000",
  "横浜ベイスターズ":"#003087","西武ライオンズ":"#4169e1",
};

type Song = {
  id: string; 選手名: string; チーム名: string; 前奏: string;
  歌詞: string; 歌詞2: string; 歌詞3: string; コール: string;
  備考: string; 汎用: boolean; 汎用の対象: string[]; 良曲: boolean;
  重複除外: boolean; notionId: number | null;
};

type Template = { id: string; 名前: string; 内容: string };
type DupePair = { a: Song; b: Song };

const emptyForm = (): Partial<Song> => ({
  選手名:"", チーム名:"", 前奏:"", 歌詞:"", 歌詞2:"", 歌詞3:"",
  コール:"", 備考:"", 汎用:false, 汎用の対象:[], 良曲:false,
});

// バイグラムJaccard類似度
function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  const clean = s.replace(/\s/g,"");
  for (let i=0; i<clean.length-1; i++) set.add(clean.slice(i,i+2));
  return set;
}
function similarity(a: string, b: string): number {
  if (!a && !b) return 1; if (!a||!b) return 0;
  const sa=bigrams(a), sb=bigrams(b); let inter=0;
  sa.forEach(g=>{if(sb.has(g))inter++;});
  const union=sa.size+sb.size-inter;
  return union===0?0:inter/union;
}
function detectDupes(songs: Song[]): DupePair[] {
  const pairs: DupePair[]=[];
  const active=songs.filter(s=>!s.重複除外);
  for(let i=0;i<active.length;i++){
    for(let j=i+1;j<active.length;j++){
      const a=active[i],b=active[j];
      if(a.チーム名!==b.チーム名||!a.チーム名) continue;
      if(similarity(a.選手名,b.選手名)<0.3) continue;
      const la=a.歌詞+a.歌詞2+a.歌詞3, lb=b.歌詞+b.歌詞2+b.歌詞3;
      if(similarity(la,lb)<0.4) continue;
      pairs.push({a,b});
    }
  }
  return pairs;
}

const css = {
  input: {width:"100%",padding:"8px 10px",borderRadius:7,border:"1px solid var(--border)",
    background:"var(--bg3)",color:"var(--text)",fontSize:14,outline:"none"} as React.CSSProperties,
  btn: (primary?:boolean, danger?:boolean, warn?:boolean): React.CSSProperties => ({
    padding:"7px 14px",borderRadius:7,
    border: primary||danger||warn?"none":"1px solid var(--border)",
    background: danger?"#7f1d1d":warn?"#78350f":primary?"var(--accent)":"transparent",
    color: danger?"#fca5a5":warn?"#fbbf24":primary?"#fff":"var(--accent-light)",
    cursor:"pointer",fontSize:13,fontWeight:primary?600:400,
  }),
};

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return (
    <div>
      <div style={{fontSize:12,color:"var(--accent-light)",marginBottom:3,fontWeight:600}}>{label}</div>
      {children}
    </div>
  );
}

// ⚪︎⚪︎ をキーワードで置換してコールを生成
function applyTemplate(template: string, keyword: string): string {
  return template.replace(/⚪︎⚪︎/g, keyword);
}

export default function Home() {
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTeam, setFilterTeam] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [searchType, setSearchType] = useState<"name"|"lyrics">("name");
  const [tab, setTab] = useState<"list"|"add"|"clubs"|"dupes"|"teams">("list");
  const [form, setForm] = useState<Partial<Song>>(emptyForm());
  const [editId, setEditId] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{msg:string,ok:boolean}|null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null);
  const [dismissing, setDismissing] = useState<string|null>(null);
  // コール入力用
  const [callKeyword, setCallKeyword] = useState("");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  // テンプレ追加
  const [newTplName, setNewTplName] = useState("");
  const [newTplContent, setNewTplContent] = useState("");
  const [addingTpl, setAddingTpl] = useState(false);
  // 球団タブ
  const [clubFilter, setClubFilter] = useState("");

  const showToast = (msg:string, ok=true) => {
    setToast({msg,ok}); setTimeout(()=>setToast(null),3000);
  };

  const fetchTeams = async () => {
    const r=await fetch("/api/teams"); const d=await r.json();
    if(d.teams) setTeams(d.teams);
  };
  const fetchTemplates = async () => {
    const r=await fetch("/api/templates"); const d=await r.json();
    if(d.templates) setTemplates(d.templates);
  };
  const fetchSongs = useCallback(async () => {
    setLoading(true);
    try {
      const r=await fetch("/api/songs"); const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setAllSongs(d.songs);
    } catch{showToast("取得に失敗しました",false);}
    setLoading(false);
  },[]);

  useEffect(()=>{fetchTeams();fetchSongs();fetchTemplates();},[fetchSongs]);

  // フィルタ（クライアント側）
  const filtered = allSongs.filter(s => {
    if(filterTeam && s.チーム名!==filterTeam) return false;
    if(filterQ){
      if(searchType==="name") return s.選手名.includes(filterQ);
      return s.歌詞.includes(filterQ)||s.歌詞2.includes(filterQ)||s.歌詞3.includes(filterQ)||s.コール.includes(filterQ);
    }
    return true;
  });

  // 球団ごとの集計
  const clubStats = (() => {
    const map: Record<string,number>={};
    allSongs.forEach(s=>{
      const t=s.チーム名||"（未設定）";
      map[t]=(map[t]||0)+1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  })();

  const dupes = detectDupes(allSongs);

  const handleSubmit = async () => {
    if(!form.選手名?.trim()){showToast("選手名は必須です",false);return;}
    setSubmitting(true);
    const isEdit=!!editId;
    const url=isEdit?`/api/songs/${encodeURIComponent(editId!)}`:`/api/songs`;
    try {
      const r=await fetch(url,{method:isEdit?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json();
      if(d.error){showToast(d.error,false);setSubmitting(false);return;}
      showToast(isEdit?"更新しました":"登録しました");
      setForm(emptyForm());setEditId(null);setTab("list");
      await fetchSongs();
    }catch{showToast("保存に失敗しました",false);}
    setSubmitting(false);
  };

  const handleDelete = async (id:string) => {
    try {
      const r=await fetch(`/api/songs/${encodeURIComponent(id)}`,{method:"DELETE"});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      showToast("削除しました");
      setAllSongs(prev=>prev.filter(s=>s.id!==id));
      setDeleteConfirm(null);
    }catch{showToast("削除に失敗しました",false);}
  };

  const handleDismissDupe = async (pair:DupePair) => {
    const key=pair.a.id+pair.b.id; setDismissing(key);
    try {
      await Promise.all([
        fetch(`/api/songs/${encodeURIComponent(pair.a.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({重複除外:true})}),
        fetch(`/api/songs/${encodeURIComponent(pair.b.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({重複除外:true})}),
      ]);
      setAllSongs(prev=>prev.map(s=>s.id===pair.a.id||s.id===pair.b.id?{...s,重複除外:true}:s));
      showToast("この組み合わせを今後無視します");
    }catch{showToast("更新に失敗しました",false);}
    setDismissing(null);
  };

  const handleAddTemplate = async () => {
    if(!newTplName.trim()||!newTplContent.trim()){showToast("名前と内容を入力してください",false);return;}
    setAddingTpl(true);
    try {
      const r=await fetch("/api/templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({名前:newTplName,内容:newTplContent})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setTemplates(d.templates);setNewTplName("");setNewTplContent("");
      showToast("テンプレートを追加しました");
    }catch{showToast("追加に失敗しました",false);}
    setAddingTpl(false);
  };

  const handleDeleteTemplate = async (id:string) => {
    try {
      const r=await fetch(`/api/templates?id=${encodeURIComponent(id)}`,{method:"DELETE"});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setTemplates(d.templates);
      showToast("削除しました");
    }catch{showToast("削除に失敗しました",false);}
  };

  const applyTpl = (tpl:Template) => {
    if(!callKeyword.trim()){showToast("先にキーワード（⚪︎⚪︎）を入力してください",false);return;}
    const result = applyTemplate(tpl.内容, callKeyword.trim());
    setForm(prev=>({...prev, コール:result}));
    setShowTemplateMenu(false);
    showToast(`「${tpl.名前}」を適用しました`);
  };

  const startEdit = (song:Song) => {
    setForm({...song}); setEditId(song.id); setCallKeyword(""); setTab("add");
  };

  const handleAddTeam = async () => {
    if(!newTeamName.trim()) return; setAddingTeam(true);
    try {
      const r=await fetch("/api/teams",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newTeamName.trim()})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setTeams(d.teams);setNewTeamName("");showToast("チームを追加しました");
    }catch{showToast("追加に失敗しました",false);}
    setAddingTeam(false);
  };

  const teamColor=(t:string)=>TEAM_COLORS[t]||"#334a66";

  const TABS = [
    {key:"list" as const, label:"一覧"},
    {key:"add" as const, label: editId?"✏️ 編集":"＋ 追加"},
    {key:"clubs" as const, label:"🏟️ 球団"},
    {key:"dupes" as const, label:`⚠️${dupes.length>0?` (${dupes.length})`:""}`, warn:dupes.length>0},
    {key:"teams" as const, label:"設定"},
  ];

  return (
    <div style={{minHeight:"100vh"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0d1b2a,#1a0a2e)",borderBottom:"1px solid var(--border)",padding:"11px 14px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:22}}>⚾</span>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)",letterSpacing:"0.04em"}}>応援歌DB</div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {TABS.map(({key,label,warn})=>(
            <button key={key} onClick={()=>{if(key!=="add"){setEditId(null);setForm(emptyForm());}setTab(key);}}
              style={{...css.btn(tab===key,false,tab!==key&&warn),padding:"5px 10px",fontSize:12}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast&&(
        <div style={{position:"fixed",top:12,right:12,zIndex:999,padding:"8px 14px",borderRadius:8,fontSize:13,
          background:toast.ok?"#1a4a2e":"#2a0f0f",border:`1px solid ${toast.ok?"#2d6b44":"#6b2d2d"}`,
          color:toast.ok?"var(--green)":"var(--red)"}}>
          {toast.msg}
        </div>
      )}

      <div style={{maxWidth:900,margin:"0 auto",padding:"12px 10px"}}>

        {/* ===== LIST ===== */}
        {tab==="list"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:9,flexWrap:"wrap"}}>
              <div style={{display:"flex",borderRadius:7,overflow:"hidden",border:"1px solid var(--border)"}}>
                {(["name","lyrics"] as const).map(type=>(
                  <button key={type} onClick={()=>setSearchType(type)}
                    style={{padding:"7px 11px",border:"none",fontSize:12,cursor:"pointer",
                      background:searchType===type?"var(--accent)":"var(--bg3)",
                      color:searchType===type?"#fff":"var(--accent-light)"}}>
                    {type==="name"?"選手名":"歌詞"}
                  </button>
                ))}
              </div>
              <input placeholder={searchType==="name"?"選手名で検索…":"歌詞で検索…"} value={filterQ}
                onChange={e=>setFilterQ(e.target.value)}
                style={{...css.input,flex:1,minWidth:120}} />
              <select value={filterTeam} onChange={e=>setFilterTeam(e.target.value)}
                style={{...css.input,width:"auto",cursor:"pointer"}}>
                <option value="">全チーム</option>
                {teams.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={fetchSongs} style={css.btn()} disabled={loading} title="再取得">🔄</button>
            </div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:7}}>
              {loading?"読込中…":`${filtered.length} / ${allSongs.length} 件`}
            </div>
            {filtered.length===0&&!loading?(
              <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>
                {allSongs.length===0?"データがありません":"検索結果がありません"}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {filtered.map(song=>{
                  const isExp=expanded===song.id;
                  const color=teamColor(song.チーム名);
                  return(
                    <div key={song.id} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderLeft:`3px solid ${color}`,borderRadius:8,overflow:"hidden"}}>
                      <div style={{padding:"9px 11px",display:"flex",alignItems:"center",gap:7}}>
                        <div style={{flex:1,cursor:"pointer",minWidth:0}} onClick={()=>setExpanded(isExp?null:song.id)}>
                          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                            <span style={{fontWeight:700,fontSize:14}}>{song.選手名||"（名前なし）"}</span>
                            {song.良曲&&<span style={{fontSize:10,background:"#1a3a5e",color:"var(--accent-light)",padding:"1px 5px",borderRadius:4}}>⭐良曲</span>}
                            {song.汎用&&<span style={{fontSize:10,background:"#1a3a2e",color:"var(--green)",padding:"1px 5px",borderRadius:4}}>汎用</span>}
                            {song.重複除外&&<span style={{fontSize:10,background:"#222",color:"#666",padding:"1px 5px",borderRadius:4}}>除外済</span>}
                          </div>
                          {song.チーム名&&<div style={{fontSize:11,color:"var(--text-muted)",marginTop:1}}>{song.チーム名}</div>}
                        </div>
                        <button onClick={()=>startEdit(song)} style={{...css.btn(),padding:"3px 9px",fontSize:12}}>編集</button>
                        <button onClick={()=>setDeleteConfirm(song.id)} style={{...css.btn(false,true),padding:"3px 9px",fontSize:12}}>削除</button>
                        <span style={{color:"var(--text-muted)",cursor:"pointer",fontSize:12,userSelect:"none",padding:"0 2px"}} onClick={()=>setExpanded(isExp?null:song.id)}>{isExp?"▲":"▼"}</span>
                      </div>
                      {deleteConfirm===song.id&&(
                        <div style={{background:"#1a0808",borderTop:"1px solid #6b2d2d",padding:"7px 11px",display:"flex",alignItems:"center",gap:7}}>
                          <span style={{fontSize:13,color:"var(--red)",flex:1}}>「{song.選手名}」を削除しますか？</span>
                          <button onClick={()=>handleDelete(song.id)} style={{...css.btn(false,true),padding:"4px 10px",fontSize:12}}>削除する</button>
                          <button onClick={()=>setDeleteConfirm(null)} style={{...css.btn(),padding:"4px 9px",fontSize:12}}>キャンセル</button>
                        </div>
                      )}
                      {isExp&&(
                        <div style={{borderTop:"1px solid var(--border)",padding:"9px 11px",display:"flex",flexDirection:"column",gap:7}}>
                          {(["前奏","歌詞","歌詞2","歌詞3","コール","備考"] as const).map(key=>
                            song[key]?(
                              <div key={key}>
                                <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:2}}>{key}</div>
                                <div style={{fontSize:13,whiteSpace:"pre-wrap",lineHeight:1.7,background:"var(--bg3)",padding:"6px 9px",borderRadius:6,color:"#c8cce8"}}>{song[key]}</div>
                              </div>
                            ):null
                          )}
                          {song.汎用の対象.length>0&&(
                            <div>
                              <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>汎用の対象</div>
                              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                                {song.汎用の対象.map(t=>(
                                  <span key={t} style={{fontSize:12,background:"var(--bg2)",border:"1px solid var(--border)",color:"var(--accent-light)",padding:"2px 7px",borderRadius:4}}>{t}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===== ADD / EDIT ===== */}
        {tab==="add"&&(
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:14,color:"var(--accent-light)"}}>
              {editId?"応援歌を編集":"新しい応援歌を登録"}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <Field label="選手名 *">
                <input value={form.選手名??""} onChange={e=>setForm({...form,選手名:e.target.value})} placeholder="例：田中将大" style={css.input} />
              </Field>
              <Field label="チーム名">
                <select value={form.チーム名??""} onChange={e=>setForm({...form,チーム名:e.target.value})} style={css.input}>
                  <option value="">選択してください</option>
                  {teams.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="前奏">
                <textarea value={form.前奏??""} onChange={e=>setForm({...form,前奏:e.target.value})} rows={2} style={{...css.input,resize:"vertical"}} />
              </Field>
              {(["歌詞","歌詞2","歌詞3"] as const).map(key=>(
                <Field key={key} label={key}>
                  <textarea value={form[key]??""} onChange={e=>setForm({...form,[key]:e.target.value})} rows={3} style={{...css.input,resize:"vertical"}} />
                </Field>
              ))}

              {/* コール入力 — テンプレ機能付き */}
              <Field label="コール">
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {/* キーワード入力 */}
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:12,color:"var(--text-muted)",whiteSpace:"nowrap"}}>⚪︎⚪︎ =</span>
                    <input value={callKeyword} onChange={e=>setCallKeyword(e.target.value)}
                      placeholder="コール内のキーワード（例：山田）"
                      style={{...css.input,flex:1,fontSize:13}} />
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setShowTemplateMenu(v=>!v)}
                        style={{...css.btn(true),padding:"6px 11px",fontSize:12,whiteSpace:"nowrap"}}>
                        テンプレ適用 ▾
                      </button>
                      {showTemplateMenu&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,minWidth:260,zIndex:100,boxShadow:"0 4px 20px #0008"}}>
                          {templates.length===0?(
                            <div style={{padding:"12px 14px",fontSize:13,color:"var(--text-muted)"}}>テンプレートがありません</div>
                          ):templates.map(tpl=>(
                            <div key={tpl.id} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer"}}
                              onClick={()=>applyTpl(tpl)}>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{tpl.名前}</div>
                                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,fontFamily:"monospace"}}>{tpl.内容.replace(/⚪︎⚪︎/g, callKeyword||"⚪︎⚪︎")}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea value={form.コール??""} onChange={e=>setForm({...form,コール:e.target.value})}
                    rows={3} placeholder="コールの内容（テンプレ適用で自動入力）"
                    style={{...css.input,resize:"vertical"}} />
                </div>
              </Field>

              <Field label="備考">
                <textarea value={form.備考??""} onChange={e=>setForm({...form,備考:e.target.value})} rows={2} style={{...css.input,resize:"vertical"}} />
              </Field>
              <div style={{display:"flex",gap:20}}>
                {(["汎用","良曲"] as const).map(key=>(
                  <label key={key} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:14}}>
                    <input type="checkbox" checked={!!form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})} />
                    {key==="良曲"?"⭐ 良曲":key}
                  </label>
                ))}
              </div>
              <Field label="汎用の対象">
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {HANYOU_TARGETS.map(t=>{
                    const checked=(form.汎用の対象??[]).includes(t);
                    return(
                      <label key={t} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:13,
                        background:checked?"#1a3a5e":"var(--bg3)",
                        border:`1px solid ${checked?"var(--accent)":"var(--border)"}`,
                        padding:"3px 9px",borderRadius:6}}>
                        <input type="checkbox" checked={checked} onChange={()=>{
                          const arr=checked?(form.汎用の対象??[]).filter(x=>x!==t):[...(form.汎用の対象??[]),t];
                          setForm({...form,汎用の対象:arr});
                        }} style={{display:"none"}} />
                        {t}
                      </label>
                    );
                  })}
                </div>
              </Field>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={handleSubmit} disabled={submitting} style={{...css.btn(true),flex:1,padding:"9px 0",fontSize:14}}>
                  {submitting?"保存中…":(editId?"更新する":"登録する")}
                </button>
                <button onClick={()=>{setForm(emptyForm());setEditId(null);setCallKeyword("");setShowTemplateMenu(false);setTab("list");}} style={{...css.btn(),padding:"9px 14px"}}>キャンセル</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== CLUBS ===== */}
        {tab==="clubs"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>🏟️ 球団別人数</div>
              <span style={{fontSize:12,color:"var(--text-muted)"}}>全 {allSongs.length} 件</span>
              <input placeholder="球団名で絞込…" value={clubFilter} onChange={e=>setClubFilter(e.target.value)}
                style={{...css.input,width:180,marginLeft:"auto"}} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {clubStats
                .filter(([t])=>!clubFilter||t.includes(clubFilter))
                .map(([team,count])=>{
                  const pct=Math.round(count/allSongs.length*100);
                  const color=teamColor(team);
                  return(
                    <div key={team}
                      onClick={()=>{setFilterTeam(team);setTab("list");}}
                      style={{background:"var(--bg2)",border:"1px solid var(--border)",borderLeft:`4px solid ${color}`,borderRadius:8,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"background 0.15s"}}
                      onMouseEnter={e=>(e.currentTarget.style.background="#111d2e")}
                      onMouseLeave={e=>(e.currentTarget.style.background="var(--bg2)")}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{team}</div>
                        <div style={{height:5,background:"var(--bg3)",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width 0.3s"}} />
                        </div>
                      </div>
                      <div style={{textAlign:"right",minWidth:60}}>
                        <span style={{fontSize:22,fontWeight:700,color}}>{count}</span>
                        <span style={{fontSize:12,color:"var(--text-muted)",marginLeft:2}}>人</span>
                        <div style={{fontSize:11,color:"var(--text-muted)"}}>{pct}%</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ===== DUPES ===== */}
        {tab==="dupes"&&(
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:14,color:"#fbbf24"}}>⚠️ 重複の可能性</div>
            {dupes.length===0?(
              <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>重複は検出されませんでした 🎉</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {dupes.map((pair,i)=>{
                  const key=pair.a.id+pair.b.id;
                  return(
                    <div key={i} style={{background:"var(--bg2)",border:"1px solid #92400e",borderRadius:10,overflow:"hidden"}}>
                      <div style={{background:"#1c1005",padding:"7px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:7}}>
                        <span style={{fontSize:13,color:"#fbbf24",fontWeight:600}}>⚠️ 重複の可能性</span>
                        <div style={{display:"flex",gap:5}}>
                          <button onClick={()=>startEdit(pair.a)} style={{...css.btn(),padding:"3px 9px",fontSize:12}}>A を編集</button>
                          <button onClick={()=>startEdit(pair.b)} style={{...css.btn(),padding:"3px 9px",fontSize:12}}>B を編集</button>
                          <button onClick={()=>handleDismissDupe(pair)} disabled={dismissing===key}
                            style={{...css.btn(),padding:"3px 9px",fontSize:12,color:"var(--green)",borderColor:"#2d6b44"}}>
                            {dismissing===key?"処理中…":"重複でない"}
                          </button>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
                        {[pair.a,pair.b].map((song,si)=>(
                          <div key={si} style={{padding:"9px 11px",borderTop:"1px solid #2a1a00",borderRight:si===0?"1px solid #2a1a00":"none"}}>
                            <div style={{fontWeight:700,fontSize:14,marginBottom:1}}>{song.選手名}</div>
                            <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:5}}>{song.チーム名}</div>
                            {song.歌詞&&<div style={{fontSize:12,color:"#c8cce8",whiteSpace:"pre-wrap",lineHeight:1.6,background:"var(--bg3)",padding:"5px 7px",borderRadius:5}}>{song.歌詞}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== SETTINGS (teams + templates) ===== */}
        {tab==="teams"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* チーム追加 */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"var(--accent-light)"}}>🏟️ チーム管理</div>
              <div style={{display:"flex",gap:7,marginBottom:12}}>
                <input value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} placeholder="例：大阪タイガース"
                  style={{...css.input,flex:1}} onKeyDown={e=>e.key==="Enter"&&handleAddTeam()} />
                <button onClick={handleAddTeam} disabled={addingTeam||!newTeamName.trim()} style={css.btn(true)}>
                  {addingTeam?"追加中…":"追加"}
                </button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {teams.map(t=>(
                  <span key={t} style={{fontSize:13,background:"var(--bg3)",border:"1px solid var(--border)",borderLeft:`3px solid ${teamColor(t)}`,padding:"4px 9px",borderRadius:6}}>{t}</span>
                ))}
              </div>
            </div>

            {/* テンプレート管理 */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4,color:"var(--accent-light)"}}>📝 コールテンプレート</div>
              <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:12}}>
                <code style={{background:"var(--bg3)",padding:"1px 5px",borderRadius:3}}>⚪︎⚪︎</code> がキーワードで置換されます
              </div>

              {/* 新規追加 */}
              <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14,padding:12,background:"var(--bg3)",borderRadius:8}}>
                <div style={{fontSize:12,color:"var(--text-muted)"}}>新しいテンプレートを追加</div>
                <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="テンプレート名（例：かっ飛ばせ）"
                  style={css.input} />
                <textarea value={newTplContent} onChange={e=>setNewTplContent(e.target.value)}
                  placeholder={"内容（例：⚪︎⚪︎！⚪︎⚪︎！かっ飛ばせ！⚪︎⚪︎）"}
                  rows={2} style={{...css.input,resize:"vertical",fontFamily:"monospace"}} />
                <button onClick={handleAddTemplate} disabled={addingTpl} style={{...css.btn(true),alignSelf:"flex-end",padding:"6px 16px"}}>
                  {addingTpl?"追加中…":"追加"}
                </button>
              </div>

              {/* テンプレ一覧 */}
              {templates.length===0?(
                <div style={{color:"var(--text-muted)",fontSize:13,textAlign:"center",padding:"12px 0"}}>テンプレートがありません</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {templates.map(tpl=>(
                    <div key={tpl.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 11px",background:"var(--bg3)",borderRadius:7}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{tpl.名前}</div>
                        <div style={{fontSize:12,color:"var(--text-muted)",fontFamily:"monospace",wordBreak:"break-all"}}>{tpl.内容}</div>
                      </div>
                      <button onClick={()=>handleDeleteTemplate(tpl.id)} style={{...css.btn(false,true),padding:"3px 9px",fontSize:11,flexShrink:0}}>削除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
