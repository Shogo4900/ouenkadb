"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  重複除外: boolean; 流用: string[];
  テンプレートID: string; テンプレートキーワード: string; テンプレートなし: boolean;
  交互演奏: boolean; 交互演奏歌詞: string;
  notionId: number | null;
};

type Template = { id: string; 名前: string; 内容: string };
type DupePair = { a: Song; b: Song };

const DRAFT_KEY = "ouen_draft";

const emptyForm = (): Partial<Song> => ({
  選手名:"", チーム名:"", 前奏:"", 歌詞:"", 歌詞2:"", 歌詞3:"",
  コール:"", 備考:"", 汎用:false, 汎用の対象:[], 良曲:false, 流用:[],
  テンプレートID:"", テンプレートキーワード:"", テンプレートなし:false,
  交互演奏:false, 交互演奏歌詞:"",
});

function loadDraft(): Partial<Song> {
  if (typeof window === "undefined") return emptyForm();
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : emptyForm();
  } catch { return emptyForm(); }
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  const clean = s.replace(/\s/g,"");
  for (let i=0;i<clean.length-1;i++) set.add(clean.slice(i,i+2));
  return set;
}
function similarity(a: string, b: string): number {
  if (!a&&!b) return 1; if (!a||!b) return 0;
  const sa=bigrams(a),sb=bigrams(b); let inter=0;
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
      const la=a.歌詞+a.歌詞2+a.歌詞3,lb=b.歌詞+b.歌詞2+b.歌詞3;
      if(similarity(la,lb)<0.4) continue;
      pairs.push({a,b});
    }
  }
  return pairs;
}

function applyTemplate(template: string, keyword: string): string {
  return template.replace(/⚪︎⚪︎/g, keyword);
}

// コールからテンプレートを推定
function guessTemplate(call: string, templates: Template[]): Template | null {
  // 内容が長い（具体的な）テンプレートを優先してマッチ
  const sorted = [...templates].sort((a, b) => b.内容.length - a.内容.length);
  for (const tpl of sorted) {
    // ⚪︎⚪︎を.*に変えて正規表現でマッチを試みる
    const escaped = tpl.内容.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/⚪︎⚪︎/g, "(.+)");
    try {
      const regex = new RegExp(`^${escaped}$`);
      if (regex.test(call)) return tpl;
    } catch {}
  }
  return null;
}

function extractKeyword(call: string, tpl: Template): string {
  const escaped = tpl.内容.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/⚪︎⚪︎/g, "(.+)");
  try {
    const match = call.match(new RegExp(`^${escaped}$`));
    return match ? match[1] : "";
  } catch { return ""; }
}

const css = {
  input: {width:"100%",padding:"8px 10px",borderRadius:7,border:"1px solid var(--border)",
    background:"var(--bg3)",color:"var(--text)",fontSize:14,outline:"none"} as React.CSSProperties,
  btn: (primary?:boolean,danger?:boolean,warn?:boolean): React.CSSProperties => ({
    padding:"7px 14px",borderRadius:7,
    border:primary||danger||warn?"none":"1px solid var(--border)",
    background:danger?"#7f1d1d":warn?"#78350f":primary?"var(--accent)":"transparent",
    color:danger?"#fca5a5":warn?"#fbbf24":primary?"#fff":"var(--accent-light)",
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

export default function Home() {
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTeam, setFilterTeam] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [filterRyoku, setFilterRyoku] = useState(false);
  const [searchType, setSearchType] = useState<"name"|"lyrics">("name");
  const [tab, setTab] = useState<"list"|"add"|"clubs"|"dupes"|"undetected"|"settings">("list");
  const [form, setForm] = useState<Partial<Song>>(emptyForm);
  const [editId, setEditId] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{msg:string,ok:boolean}|null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null);
  const [dismissing, setDismissing] = useState<string|null>(null);
  const [callKeyword, setCallKeyword] = useState("");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplContent, setNewTplContent] = useState("");
  const [addingTpl, setAddingTpl] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Template|null>(null);
  const [editTplContent, setEditTplContent] = useState("");
  const [editTplName, setEditTplName] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const [clubFilter, setClubFilter] = useState("");
  const [ryuyoQuery, setRyuyoQuery] = useState("");
  // テンプレート不明警告（編集時）
  const [tplWarning, setTplWarning] = useState(false);
  // 一括判定
  const [detectingTpl, setDetectingTpl] = useState(false);
  const [detectResult, setDetectResult] = useState<{updated:number,undetected:number,total:number}|null>(null);
  // 歌詞テキスト一括正規化
  const [normalizingText, setNormalizingText] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<{updated:number,unchanged:number,total:number}|null>(null);

  const showToast = (msg:string,ok=true) => {
    setToast({msg,ok}); setTimeout(()=>setToast(null),3500);
  };

  useEffect(() => {
    if (tab === "add" && !editId) setForm(loadDraft());
  }, [tab, editId]);

  useEffect(() => {
    if (editId) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
  }, [form, editId]);

  const fetchTeams = useCallback(async () => {
    const r=await fetch("/api/teams"); const d=await r.json();
    if(d.teams) setTeams(d.teams);
  },[]);

  const fetchTemplates = useCallback(async () => {
    const r=await fetch("/api/templates"); const d=await r.json();
    if(d.templates) setTemplates(d.templates);
  },[]);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    try {
      const r=await fetch("/api/songs"); const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setAllSongs(d.songs);
    } catch{showToast("取得に失敗しました",false);}
    setLoading(false);
  },[]);

  useEffect(()=>{fetchTeams();fetchSongs();fetchTemplates();},[fetchTeams,fetchSongs,fetchTemplates]);

  // 一覧タブに切り替えたときに再取得（Notion側で直接追加された曲を反映）
  const isFirstTabRender = useRef(true);
  useEffect(() => {
    if (isFirstTabRender.current) { isFirstTabRender.current = false; return; }
    if (tab === "list") fetchSongs();
  }, [tab, fetchSongs]);

  // アプリに戻ってきたとき（他アプリ/タブでNotionに追加後の復帰）に再取得
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") fetchSongs();
    };
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [fetchSongs]);

  const songMap = Object.fromEntries(allSongs.map(s=>[s.id,s]));

  const filtered = allSongs.filter(s => {
    if(filterTeam && s.チーム名!==filterTeam) return false;
    if(filterRyoku && !s.良曲) return false;
    if(filterQ){
      if(searchType==="name") return s.選手名.includes(filterQ);
      return s.前奏.includes(filterQ)||s.歌詞.includes(filterQ)||s.歌詞2.includes(filterQ)||s.歌詞3.includes(filterQ)||s.コール.includes(filterQ);
    }
    return true;
  });

  const clubStats = (() => {
    const map: Record<string,number>={};
    allSongs.forEach(s=>{ const t=s.チーム名||"（未設定）"; map[t]=(map[t]||0)+1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  })();

  const dupes = detectDupes(allSongs);
  const ryuyoCandidates = ryuyoQuery.trim()
    ? allSongs.filter(s=>s.id!==editId&&(s.選手名.includes(ryuyoQuery)||s.チーム名.includes(ryuyoQuery)))
    : [];

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

  const handleSubmit = async () => {
    if(!form.選手名?.trim()){showToast("選手名は必須です",false);return;}
    if(!form.チーム名){showToast("球団名を選択してください",false);return;}
    setSubmitting(true);
    const isEdit=!!editId;
    const url=isEdit?`/api/songs/${encodeURIComponent(editId!)}`:`/api/songs`;
    try {
      const r=await fetch(url,{method:isEdit?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json();
      if(d.error){showToast(d.error,false);setSubmitting(false);return;}
      showToast(isEdit?"更新しました":"登録しました");
      const savedEditId=editId;
      clearDraft();
      setForm(emptyForm());setEditId(null);setCallKeyword("");setTplWarning(false);setTab("list");
      if(savedEditId){
        setTimeout(()=>{
          document.getElementById(`song-${savedEditId}`)?.scrollIntoView({block:"center",behavior:"auto"});
        },30);
      }
      await fetchSongs(); await fetchTeams();
    } catch{showToast("保存に失敗しました",false);}
    setSubmitting(false);
  };

  const handleDelete = async (id:string) => {
    try {
      const r=await fetch(`/api/songs/${encodeURIComponent(id)}`,{method:"DELETE"});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      showToast("削除しました");
      setAllSongs(prev=>prev.filter(s=>s.id!==id)); setDeleteConfirm(null);
    } catch{showToast("削除に失敗しました",false);}
  };

  const toggleRyoku = async (song: Song) => {
    const next=!song.良曲;
    setAllSongs(prev=>prev.map(s=>s.id===song.id?{...s,良曲:next}:s));
    try {
      const r=await fetch(`/api/songs/${encodeURIComponent(song.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({良曲:next})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);setAllSongs(prev=>prev.map(s=>s.id===song.id?{...s,良曲:!next}:s));}
      else showToast(next?"⭐ 良曲に追加":"良曲を解除");
    } catch{showToast("更新に失敗しました",false);setAllSongs(prev=>prev.map(s=>s.id===song.id?{...s,良曲:!next}:s));}
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
    } catch{showToast("更新に失敗しました",false);}
    setDismissing(null);
  };

  const handleAddTemplate = async () => {
    if(!newTplName.trim()||!newTplContent.trim()){showToast("名前と内容を入力してください",false);return;}
    setAddingTpl(true);
    try {
      const r=await fetch("/api/templates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({名前:newTplName,内容:newTplContent})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);setAddingTpl(false);return;}
      setTemplates(d.templates); setNewTplName(""); setNewTplContent("");
      showToast("テンプレートを追加しました");
    } catch{showToast("追加に失敗しました",false);}
    setAddingTpl(false);
  };

  const handleDeleteTemplate = async (id:string) => {
    try {
      const r=await fetch(`/api/templates?id=${encodeURIComponent(id)}`,{method:"DELETE"});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setTemplates(d.templates); showToast("削除しました");
    } catch{showToast("削除に失敗しました",false);}
  };

  const handleSaveTemplate = async () => {
    if(!editingTpl||!editTplContent.trim()) return;
    setSavingTpl(true);
    try {
      const r=await fetch("/api/templates",{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:editingTpl.id,名前:editTplName,内容:editTplContent})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);setSavingTpl(false);return;}
      setTemplates(d.templates);
      showToast(`保存しました（${d.updated}件のコールを更新）`);
      setEditingTpl(null);
      // ローカルのsongs内コールも更新
      await fetchSongs();
    } catch{showToast("保存に失敗しました",false);}
    setSavingTpl(false);
  };

  const applyTpl = (tpl:Template) => {
    if(!callKeyword.trim()){showToast("先にキーワード（⚪︎⚪︎）を入力してください",false);return;}
    const newCall = applyTemplate(tpl.内容, callKeyword.trim());
    setForm(prev=>({...prev, コール:newCall, テンプレートID:tpl.id, テンプレートキーワード:callKeyword.trim()}));
    setShowTemplateMenu(false);
    showToast(`「${tpl.名前}」を適用しました`);
  };

  const startEdit = (song:Song) => {
    setForm({...song});
    setEditId(song.id);
    setCallKeyword(song.テンプレートキーワード||"");
    setRyuyoQuery("");
    setTplWarning(false);
    // テンプレートなし明示済みはそのまま
    if(!song.テンプレートなし && song.コール && !song.テンプレートID) {
      const guessed = guessTemplate(song.コール, templates);
      if(guessed) {
        const kw = extractKeyword(song.コール, guessed);
        setForm(prev=>({...prev, テンプレートID:guessed.id, テンプレートキーワード:kw}));
        setCallKeyword(kw);
        showToast(`テンプレート「${guessed.名前}」を自動検出しました`);
      } else {
        setTplWarning(true);
      }
    }
    setTab("add");
  };

  // 一覧からテンプレートなしを即時トグル
  const toggleTplNashi = async (song: Song) => {
    const next = !song.テンプレートなし;
    setAllSongs(prev=>prev.map(s=>s.id===song.id?{...s,テンプレートなし:next, テンプレートID:next?"":s.テンプレートID}:s));
    try {
      const r=await fetch(`/api/songs/${encodeURIComponent(song.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({テンプレートなし:next, ...(next?{テンプレートID:"",テンプレートキーワード:""}:{})})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);setAllSongs(prev=>prev.map(s=>s.id===song.id?{...s,テンプレートなし:!next}:s));}
      else showToast(next?"手動入力としてマークしました":"マークを解除しました");
    } catch{showToast("更新に失敗しました",false);setAllSongs(prev=>prev.map(s=>s.id===song.id?{...s,テンプレートなし:!next}:s));}
  };

  const handleBulkDetect = async () => {
    setDetectingTpl(true); setDetectResult(null);
    try {
      const r=await fetch("/api/songs/bulk-detect-template",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({templates:templates.map(t=>({id:t.id,内容:t.内容}))}),
      });
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setDetectResult(d);
      showToast(`${d.updated}件を自動判定しました`);
      await fetchSongs();
    } catch{showToast("失敗しました",false);}
    setDetectingTpl(false);
  };

  const handleBulkNormalize = async () => {
    if (!confirm("前奏・歌詞・歌詞2・歌詞3・交互演奏歌詞の全件に対して、全角スペース→半角、改行削除、！化、…化を一括適用します。よろしいですか？")) return;
    setNormalizingText(true); setNormalizeResult(null);
    try {
      const r = await fetch("/api/songs/bulk-normalize-text", { method: "POST" });
      const d = await r.json();
      if (d.error) { showToast(d.error, false); return; }
      setNormalizeResult(d);
      showToast(`${d.updated}件のテキストを正規化しました`);
      await fetchSongs();
    } catch { showToast("失敗しました", false); }
    setNormalizingText(false);
  };

  const handleAddTeam = async () => {
    if(!newTeamName.trim()) return; setAddingTeam(true);
    try {
      const r=await fetch("/api/teams",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newTeamName.trim()})});
      const d=await r.json();
      if(d.error){showToast(d.error,false);return;}
      setTeams(d.teams); setNewTeamName(""); showToast("チームを追加しました");
    } catch{showToast("追加に失敗しました",false);}
    setAddingTeam(false);
  };

  const teamColor=(t:string)=>TEAM_COLORS[t]||"#334a66";
  const tplMap = Object.fromEntries(templates.map(t=>[t.id,t]));

  const TABS=[
    {key:"list" as const,label:"一覧"},
    {key:"add" as const,label:editId?"✏️ 編集":"＋ 追加"},
    {key:"clubs" as const,label:"🏟️ 球団"},
    {key:"dupes" as const,label:`⚠️${dupes.length>0?` (${dupes.length})`:""}`,warn:dupes.length>0},
    {key:"undetected" as const,label:`❓ 未判定${allSongs.filter(s=>s.コール&&!s.テンプレートID&&!s.テンプレートなし).length>0?" ("+allSongs.filter(s=>s.コール&&!s.テンプレートID&&!s.テンプレートなし).length+")":""}`,warn:allSongs.filter(s=>s.コール&&!s.テンプレートID&&!s.テンプレートなし).length>0},
    {key:"settings" as const,label:"設定"},
  ];

  return (
    <div style={{minHeight:"100vh"}}>
      <div style={{position:"sticky",top:0,zIndex:100,background:"linear-gradient(135deg,#0d1b2a,#1a0a2e)",borderBottom:"1px solid var(--border)",padding:"11px 14px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:22}}>⚾</span>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent-light)",letterSpacing:"0.04em"}}>応援歌DB</div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {TABS.map(({key,label,warn})=>(
            <button key={key} onClick={()=>{if(key!=="add"){setEditId(null);}setTab(key);}}
              style={{...css.btn(tab===key,false,tab!==key&&!!warn),padding:"5px 10px",fontSize:12}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {toast&&(
        <div style={{position:"fixed",top:12,right:12,zIndex:999,padding:"8px 14px",borderRadius:8,fontSize:13,
          background:toast.ok?"#1a4a2e":"#2a0f0f",border:`1px solid ${toast.ok?"#2d6b44":"#6b2d2d"}`,
          color:toast.ok?"var(--green)":"var(--red)"}}>
          {toast.msg}
        </div>
      )}

      <div style={{maxWidth:900,margin:"0 auto",padding:"12px 10px"}}>

        {tab==="list"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
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
              <input placeholder={searchType==="name"?"選手名で検索…":"前奏・歌詞・コールで検索…"}
                value={filterQ} onChange={e=>setFilterQ(e.target.value)}
                style={{...css.input,flex:1,minWidth:120}} />
              <select value={filterTeam} onChange={e=>setFilterTeam(e.target.value)}
                style={{...css.input,width:"auto",cursor:"pointer"}}>
                <option value="">全球団</option>
                {teams.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={fetchSongs} style={css.btn()} disabled={loading} title="再取得">🔄</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={filterRyoku} onChange={e=>setFilterRyoku(e.target.checked)} />
                <span style={{color:filterRyoku?"var(--accent-light)":"var(--text-muted)"}}>⭐ 良曲のみ</span>
              </label>
              <span style={{fontSize:12,color:"var(--text-muted)"}}>
                {loading?"読込中…":`${filtered.length} / ${allSongs.length} 件`}
                {filterTeam&&<span style={{marginLeft:6,color:"var(--accent-light)"}}> — {filterTeam}</span>}
              </span>
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
                  const ryuyoNames=(song.流用??[]).map(id=>songMap[id]?.選手名).filter(Boolean);
                  const tplName=song.テンプレートID?tplMap[song.テンプレートID]?.名前:null;
                  return(
                    <div key={song.id} id={`song-${song.id}`} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderLeft:`3px solid ${color}`,borderRadius:8,overflow:"hidden"}}>
                      <div style={{padding:"9px 11px",display:"flex",alignItems:"center",gap:6}}>
                        <div style={{flex:1,cursor:"pointer",minWidth:0}} onClick={()=>setExpanded(isExp?null:song.id)}>
                          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                            <span style={{fontWeight:700,fontSize:14}}>{song.選手名||"（名前なし）"}</span>
                            {song.良曲&&<span style={{fontSize:10,background:"#1a3a5e",color:"var(--accent-light)",padding:"1px 5px",borderRadius:4}}>⭐良曲</span>}
                            {song.汎用&&<span style={{fontSize:10,background:"#1a3a2e",color:"var(--green)",padding:"1px 5px",borderRadius:4}}>汎用</span>}
                            {tplName&&<span style={{fontSize:10,background:"#1a1a3a",color:"#b0a0e0",padding:"1px 5px",borderRadius:4}}>📝{tplName}</span>}
                            {ryuyoNames.length>0&&<span style={{fontSize:10,background:"#1a2a3a",color:"#a0b4c8",padding:"1px 5px",borderRadius:4}}>流用: {ryuyoNames.join(", ")}</span>}
                            {song.テンプレートなし&&<span style={{fontSize:10,background:"#2a1a00",color:"#f59e0b",padding:"1px 5px",borderRadius:4}}>手動</span>}
                            {!song.テンプレートID&&!song.テンプレートなし&&song.コール&&<span style={{fontSize:10,background:"#1a1000",color:"#888",padding:"1px 5px",borderRadius:4}}>❓未判定</span>}
                            {song.重複除外&&<span style={{fontSize:10,background:"#222",color:"#666",padding:"1px 5px",borderRadius:4}}>除外済</span>}
                          </div>
                          {song.チーム名&&<div style={{fontSize:11,color:"var(--text-muted)",marginTop:1}}>{song.チーム名}</div>}
                        </div>
                        <button onClick={()=>toggleRyoku(song)} title={song.良曲?"良曲を解除":"良曲に追加"}
                          style={{...css.btn(),padding:"3px 8px",fontSize:14,
                            color:song.良曲?"#fbbf24":"var(--text-muted)",
                            borderColor:song.良曲?"#92400e":"var(--border)"}}>⭐</button>
                        <button onClick={()=>toggleTplNashi(song)}
                          title={song.テンプレートなし?"手動マークを解除":"テンプレートなし（手動）としてマーク"}
                          style={{...css.btn(),padding:"3px 8px",fontSize:12,
                            color:song.テンプレートなし?"#f59e0b":"var(--text-muted)",
                            borderColor:song.テンプレートなし?"#92400e":"var(--border)"}}>手</button>
                        <button onClick={()=>startEdit(song)} style={{...css.btn(),padding:"3px 9px",fontSize:12}}>編集</button>
                        <button onClick={()=>setDeleteConfirm(song.id)} style={{...css.btn(false,true),padding:"3px 9px",fontSize:12}}>削除</button>
                        <span style={{color:"var(--text-muted)",cursor:"pointer",fontSize:12,userSelect:"none",padding:"0 2px"}}
                          onClick={()=>setExpanded(isExp?null:song.id)}>{isExp?"▲":"▼"}</span>
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
                          {(["前奏","歌詞","歌詞2","歌詞3","コール","備考","交互演奏歌詞"] as const).map(key=>
                            song[key]?(
                              <div key={key}>
                                <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:2}}>{key}</div>
                                <div style={{fontSize:13,whiteSpace:"pre-wrap",lineHeight:1.7,background:"var(--bg3)",padding:"6px 9px",borderRadius:6,color:"#c8cce8"}}>{song[key]}</div>
                              </div>
                            ):null
                          )}
                          {song.交互演奏&&(
                            <div style={{fontSize:11,background:"#0d1a2e",border:"1px solid var(--border)",color:"var(--accent-light)",padding:"3px 8px",borderRadius:5,display:"inline-block"}}>🎵 交互演奏あり</div>
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

        {tab==="add"&&(
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>
                {editId?"応援歌を編集":"新しい応援歌を登録"}
              </div>
              {!editId&&<span style={{fontSize:11,color:"var(--text-muted)"}}>入力内容は自動保存されます</span>}
            </div>

            {/* テンプレート不明警告 */}
            {tplWarning&&(
              <div style={{background:"#1c1005",border:"1px solid #92400e",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#fbbf24"}}>
                ⚠️ コールが手動入力されています。テンプレートを適用するか、キーワードを手動で入力してください。
                <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
                  <input value={form.テンプレートキーワード??""} onChange={e=>setForm(prev=>({...prev,テンプレートキーワード:e.target.value}))}
                    placeholder="キーワードを手動入力（例：山田）"
                    style={{...css.input,fontSize:13,flex:1}} />
                  <button onClick={()=>setTplWarning(false)} style={{...css.btn(),padding:"4px 10px",fontSize:12}}>閉じる</button>
                </div>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <Field label="選手名 *">
                <input value={form.選手名??""} onChange={e=>setForm({...form,選手名:e.target.value})} placeholder="例：田中将大" style={css.input} />
              </Field>
              <Field label="球団名 *">
                <select value={form.チーム名??""} onChange={e=>setForm({...form,チーム名:e.target.value})}
                  style={{...css.input,borderColor:!form.チーム名?"#92400e":"var(--border)"}}>
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
              <Field label="コール">
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {/* テンプレート情報表示 */}
                  {form.テンプレートID&&tplMap[form.テンプレートID]&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#b0a0e0",background:"#1a1a3a",padding:"5px 10px",borderRadius:6}}>
                      <span>📝 {tplMap[form.テンプレートID].名前}</span>
                      <span style={{color:"var(--text-muted)"}}>キーワード: {form.テンプレートキーワード||"（未設定）"}</span>
                      <button onClick={()=>setForm(prev=>({...prev,テンプレートID:"",テンプレートキーワード:""}))}
                        style={{marginLeft:"auto",...css.btn(),padding:"2px 7px",fontSize:11,color:"var(--text-muted)"}}>解除</button>
                    </div>
                  )}
                  {/* テンプレートなしマーク */}
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:13}}>
                      <input type="checkbox" checked={!!form.テンプレートなし}
                        onChange={e=>setForm(prev=>({...prev,テンプレートなし:e.target.checked,...(e.target.checked?{テンプレートID:"",テンプレートキーワード:""}:{})}))} />
                      <span style={{color:form.テンプレートなし?"#f59e0b":"var(--text-muted)"}}>手動入力（テンプレートなし）として記録</span>
                    </label>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:12,color:"var(--text-muted)",whiteSpace:"nowrap"}}>⚪︎⚪︎ =</span>
                    <input value={callKeyword} onChange={e=>{setCallKeyword(e.target.value);setForm(prev=>({...prev,テンプレートキーワード:e.target.value}));}}
                      placeholder="コール内のキーワード（例：山田）"
                      style={{...css.input,flex:1,fontSize:13}} />
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setShowTemplateMenu(v=>!v)}
                        style={{...css.btn(true),padding:"6px 11px",fontSize:12,whiteSpace:"nowrap"}}>
                        テンプレ ▾
                      </button>
                      {showTemplateMenu&&(
                        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,minWidth:260,zIndex:100,boxShadow:"0 4px 20px #0008"}}>
                          {templates.length===0?(
                            <div style={{padding:"12px 14px",fontSize:13,color:"var(--text-muted)"}}>テンプレートがありません</div>
                          ):templates.map(tpl=>(
                            <div key={tpl.id} style={{padding:"8px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",
                              background:form.テンプレートID===tpl.id?"#1a1a3a":""}}
                              onClick={()=>applyTpl(tpl)}
                              onMouseEnter={e=>(e.currentTarget.style.background="#111d2e")}
                              onMouseLeave={e=>(e.currentTarget.style.background=form.テンプレートID===tpl.id?"#1a1a3a":"")}>
                              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{tpl.名前}</div>
                              <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,fontFamily:"monospace"}}>
                                {callKeyword?applyTemplate(tpl.内容,callKeyword):tpl.内容}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea value={form.コール??""} onChange={e=>{setForm({...form,コール:e.target.value});}}
                    rows={3} placeholder="コールの内容（テンプレ適用で自動入力）"
                    style={{...css.input,resize:"vertical"}} />
                </div>
              </Field>
              <Field label="備考">
                <textarea value={form.備考??""} onChange={e=>setForm({...form,備考:e.target.value})} rows={2} style={{...css.input,resize:"vertical"}} />
              </Field>
              {/* 交互演奏 */}
              <div style={{display:"flex",flexDirection:"column",gap:8,padding:"10px 12px",background:"var(--bg3)",borderRadius:8}}>
                <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:14}}>
                  <input type="checkbox" checked={!!form.交互演奏} onChange={e=>setForm({...form,交互演奏:e.target.checked})} />
                  <span style={{color:form.交互演奏?"var(--accent-light)":"var(--text-muted)"}}>🎵 交互演奏</span>
                </label>
                {form.交互演奏&&(
                  <Field label="交互演奏歌詞">
                    <textarea value={form.交互演奏歌詞??""} onChange={e=>setForm({...form,交互演奏歌詞:e.target.value})}
                      rows={3} placeholder="交互演奏時の歌詞を入力" style={{...css.input,resize:"vertical"}} />
                  </Field>
                )}
              </div>
              <Field label="流用元">
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {(form.流用??[]).length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {(form.流用??[]).map(id=>{
                        const s=songMap[id];
                        return s?(
                          <span key={id} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,background:"#1a2a3a",border:"1px solid var(--border)",color:"#a0b4c8",padding:"3px 8px",borderRadius:5}}>
                            {s.選手名}（{s.チーム名}）
                            <span style={{cursor:"pointer",color:"var(--red)",fontWeight:700}}
                              onClick={()=>setForm(prev=>({...prev,流用:(prev.流用??[]).filter(x=>x!==id)}))}>×</span>
                          </span>
                        ):null;
                      })}
                    </div>
                  )}
                  <div style={{position:"relative"}}>
                    <input value={ryuyoQuery} onChange={e=>setRyuyoQuery(e.target.value)}
                      placeholder="選手名・球団名で検索して追加…"
                      style={{...css.input,fontSize:13}} />
                    {ryuyoCandidates.length>0&&(
                      <div style={{position:"absolute",top:"calc(100% + 2px)",left:0,right:0,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:7,zIndex:100,maxHeight:200,overflowY:"auto",boxShadow:"0 4px 16px #0008"}}>
                        {ryuyoCandidates.slice(0,20).map(s=>{
                          const already=(form.流用??[]).includes(s.id);
                          return(
                            <div key={s.id}
                              onClick={()=>{if(!already){setForm(prev=>({...prev,流用:[...(prev.流用??[]),s.id]}));}setRyuyoQuery("");}}
                              style={{padding:"7px 11px",cursor:already?"default":"pointer",background:already?"#0d1b2a":"",
                                borderBottom:"1px solid var(--border)",fontSize:13,color:already?"var(--text-muted)":"var(--text)"}}
                              onMouseEnter={e=>{if(!already)e.currentTarget.style.background="#111d2e";}}
                              onMouseLeave={e=>{e.currentTarget.style.background=already?"#0d1b2a":"";}}>
                              <span style={{fontWeight:600}}>{s.選手名}</span>
                              <span style={{fontSize:11,color:"var(--text-muted)",marginLeft:6}}>{s.チーム名}</span>
                              {already&&<span style={{fontSize:11,color:"var(--text-muted)",marginLeft:6}}>（追加済）</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
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
                <button onClick={()=>{clearDraft();setForm(emptyForm());setEditId(null);setCallKeyword("");setShowTemplateMenu(false);setRyuyoQuery("");setTplWarning(false);setTab("list");}}
                  style={{...css.btn(),padding:"9px 14px"}}>キャンセル</button>
              </div>
            </div>
          </div>
        )}

        {tab==="clubs"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--accent-light)"}}>🏟️ 球団別人数</div>
              <span style={{fontSize:12,color:"var(--text-muted)"}}>全 {allSongs.length} 件</span>
              <input placeholder="球団名で絞込…" value={clubFilter} onChange={e=>setClubFilter(e.target.value)}
                style={{...css.input,width:180,marginLeft:"auto"}} />
            </div>
            {filterTeam&&(
              <div style={{marginBottom:10}}>
                <button onClick={()=>{setFilterTeam("");setTab("list");}}
                  style={{...css.btn(true),padding:"5px 14px",fontSize:12}}>← 全球団に戻る</button>
                <span style={{marginLeft:10,fontSize:13,color:"var(--accent-light)"}}>{filterTeam} で絞り込み中</span>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {clubStats.filter(([t])=>!clubFilter||t.includes(clubFilter)).map(([team,count])=>{
                const pct=Math.round(count/allSongs.length*100);
                const color=teamColor(team);
                const isActive=filterTeam===team;
                return(
                  <div key={team}
                    onClick={()=>{setFilterTeam(isActive?"":team);setTab("list");}}
                    style={{background:isActive?"#111d2e":"var(--bg2)",border:`1px solid ${isActive?"var(--accent)":"var(--border)"}`,
                      borderLeft:`4px solid ${color}`,borderRadius:8,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}
                    onMouseEnter={e=>(e.currentTarget.style.background="#111d2e")}
                    onMouseLeave={e=>(e.currentTarget.style.background=isActive?"#111d2e":"var(--bg2)")}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{team}</div>
                      <div style={{height:5,background:"var(--bg3)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3}} />
                      </div>
                    </div>
                    <div style={{textAlign:"right",minWidth:60}}>
                      <span style={{fontSize:22,fontWeight:700,color}}>{count}</span>
                      <span style={{fontSize:12,color:"var(--text-muted)",marginLeft:2}}>件</span>
                      <div style={{fontSize:11,color:"var(--text-muted)"}}>{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

        {tab==="undetected"&&(()=>{
          const undetected = allSongs.filter(s=>s.コール&&!s.テンプレートID&&!s.テンプレートなし);
          return (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,color:"#f59e0b"}}>❓ 未判定コール</div>
              <span style={{fontSize:12,color:"var(--text-muted)"}}>コールはあるがテンプレート未設定 {undetected.length}件</span>
            </div>
            {undetected.length===0?(
              <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>未判定のコールはありません 🎉</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {undetected.map(song=>{
                  const color=teamColor(song.チーム名);
                  return(
                    <div key={song.id} style={{background:"var(--bg2)",border:"1px solid #92400e",borderLeft:`3px solid ${color}`,borderRadius:8,overflow:"hidden"}}>
                      <div style={{padding:"9px 11px",display:"flex",alignItems:"center",gap:7}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:14}}>{song.選手名}</div>
                          <div style={{fontSize:11,color:"var(--text-muted)",marginTop:1}}>{song.チーム名}</div>
                          <div style={{fontSize:12,color:"#c8cce8",marginTop:4,background:"var(--bg3)",padding:"5px 8px",borderRadius:5,whiteSpace:"pre-wrap"}}>{song.コール}</div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:5}}>
                          <button onClick={()=>startEdit(song)} style={{...css.btn(true),padding:"4px 10px",fontSize:12}}>編集</button>
                          <button onClick={()=>toggleTplNashi(song)}
                            style={{...css.btn(),padding:"4px 10px",fontSize:12,color:"#f59e0b",borderColor:"#92400e"}}>手動</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
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
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4,color:"var(--accent-light)"}}>✨ テキスト正規化</div>
              <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8}}>
                全角スペース→半角、改行削除、「!」→「！」、「...」→「…」を一括変換します（前奏・歌詞・歌詞2・歌詞3・交互演奏歌詞）
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"var(--bg3)",borderRadius:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>過去データを一括正規化</div>
                  <div style={{fontSize:11,color:"var(--text-muted)"}}>全件をスキャンし、変換が必要なレコードのみ更新します</div>
                  {normalizeResult&&(
                    <div style={{fontSize:11,marginTop:4,color:"var(--green)"}}>
                      完了: {normalizeResult.total}件中 {normalizeResult.updated}件を変換しました
                    </div>
                  )}
                </div>
                <button onClick={handleBulkNormalize} disabled={normalizingText}
                  style={{...css.btn(true),padding:"6px 14px",fontSize:12,whiteSpace:"nowrap"}}>
                  {normalizingText?"変換中…":"一括変換"}
                </button>
              </div>
            </div>
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4,color:"var(--accent-light)"}}>📝 コールテンプレート</div>
              <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8}}>
                <code style={{background:"var(--bg3)",padding:"1px 5px",borderRadius:3}}>⚪︎⚪︎</code> がキーワードで置換されます。内容を編集すると使用中の応援歌のコールも自動更新されます。
              </div>
              {/* 一括判定 */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"10px 12px",background:"var(--bg3)",borderRadius:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>テンプレート一括判定</div>
                  <div style={{fontSize:11,color:"var(--text-muted)"}}>テンプレートIDが未設定のコールを全件スキャンして自動で紐付けます</div>
                  {detectResult&&(
                    <div style={{fontSize:11,marginTop:4,color:"var(--green)"}}>
                      完了: {detectResult.total}件中 {detectResult.updated}件を判定、{detectResult.undetected}件は判定不可
                    </div>
                  )}
                </div>
                <button onClick={handleBulkDetect} disabled={detectingTpl||templates.length===0}
                  style={{...css.btn(true),padding:"6px 14px",fontSize:12,whiteSpace:"nowrap"}}>
                  {detectingTpl?"判定中…":"一括判定"}
                </button>
              </div>
              {/* 新規追加 */}
              <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14,padding:12,background:"var(--bg3)",borderRadius:8}}>
                <div style={{fontSize:12,color:"var(--text-muted)"}}>新しいテンプレートを追加</div>
                <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="テンプレート名（例：かっ飛ばせ）" style={css.input} />
                <textarea value={newTplContent} onChange={e=>setNewTplContent(e.target.value)}
                  placeholder={"内容（例：⚪︎⚪︎！⚪︎⚪︎！かっ飛ばせ！⚪︎⚪︎）"}
                  rows={2} style={{...css.input,resize:"vertical",fontFamily:"monospace"}} />
                <button onClick={handleAddTemplate} disabled={addingTpl} style={{...css.btn(true),alignSelf:"flex-end",padding:"6px 16px"}}>
                  {addingTpl?"追加中…":"追加"}
                </button>
              </div>
              {/* テンプレート一覧 */}
              {templates.length===0?(
                <div style={{color:"var(--text-muted)",fontSize:13,textAlign:"center",padding:"12px 0"}}>テンプレートがありません</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {templates.map(tpl=>(
                    <div key={tpl.id} style={{background:"var(--bg3)",borderRadius:7,overflow:"hidden"}}>
                      {editingTpl?.id===tpl.id?(
                        /* 編集モード */
                        <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:7}}>
                          <input value={editTplName} onChange={e=>setEditTplName(e.target.value)}
                            style={{...css.input,fontSize:13,fontWeight:600}} />
                          <textarea value={editTplContent} onChange={e=>setEditTplContent(e.target.value)}
                            rows={2} style={{...css.input,resize:"vertical",fontFamily:"monospace",fontSize:13}} />
                          <div style={{fontSize:11,color:"#fbbf24"}}>
                            ⚠️ 保存するとこのテンプレートを使用中の全応援歌のコールが自動更新されます
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={handleSaveTemplate} disabled={savingTpl}
                              style={{...css.btn(true),padding:"5px 14px",fontSize:12}}>
                              {savingTpl?"保存中…":"保存して更新"}
                            </button>
                            <button onClick={()=>setEditingTpl(null)} style={{...css.btn(),padding:"5px 10px",fontSize:12}}>キャンセル</button>
                          </div>
                        </div>
                      ):(
                        /* 通常表示 */
                        <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 11px"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{tpl.名前}</div>
                            <div style={{fontSize:12,color:"var(--text-muted)",fontFamily:"monospace",wordBreak:"break-all"}}>{tpl.内容}</div>
                            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:3}}>
                              使用中: {allSongs.filter(s=>s.テンプレートID===tpl.id).length}件
                            </div>
                          </div>
                          <div style={{display:"flex",gap:5,flexShrink:0}}>
                            <button onClick={()=>{setEditingTpl(tpl);setEditTplName(tpl.名前);setEditTplContent(tpl.内容);}}
                              style={{...css.btn(),padding:"3px 9px",fontSize:11}}>編集</button>
                            <button onClick={()=>handleDeleteTemplate(tpl.id)}
                              style={{...css.btn(false,true),padding:"3px 9px",fontSize:11}}>削除</button>
                          </div>
                        </div>
                      )}
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
