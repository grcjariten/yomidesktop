// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Dictionaries suggested by the setup wizard: the same set used by the author,
// downloaded from their official sources (nothing is redistributed by YomiDesktop).
const suggestedDictionaries=[
  {id:'jitendex',title:'Jitendex',kind:'dictionary',size:'39 MB',url:'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip',match:/^Jitendex/i},
  {id:'jmnedict',title:'JMnedict',kind:'names',size:'11 MB',url:'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip',match:/^JMnedict/i},
  {id:'kanjidic',title:'KANJIDIC',kind:'kanji',size:'1 MB',url:'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip',match:/^KANJIDIC/i},
  {id:'bccwj',title:'BCCWJ',kind:'frequency',size:'19 MB',url:'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip',match:/^BCCWJ/i},
  {id:'jpdb',title:'JPDB',kind:'frequency',size:'6 MB',url:'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip',match:/^JPDB/i},
  {id:'jiten',title:'Jiten',kind:'frequency',size:'5 MB',url:'https://api.jiten.moe/api/frequency-list/download',match:/^Jiten$/i},
  {id:'jiten-youtube',title:'Jiten (YouTube)',kind:'frequency',size:'5 MB',url:'https://api.jiten.moe/api/frequency-list/download?mediaType=YouTube',match:/^(Jiten \(YouTube\)|Youtube)$/i},
  {id:'jiten-drama',title:'Jiten (Drama)',kind:'frequency',size:'5 MB',url:'https://api.jiten.moe/api/frequency-list/download?mediaType=Drama',match:/^Jiten \(Drama\)$/i},
];
function installedIds(dictionaries){
  const titles=(dictionaries||[]).map(d=>String(d.title||''));
  return suggestedDictionaries.filter(d=>titles.some(t=>d.match.test(t))).map(d=>d.id);
}
// Only these pages can be opened from the wizard and the panel.
const ankiLinks={
  anki:'https://apps.ankiweb.net/',
  ankiconnect:'https://ankiweb.net/shared/info/2055492159',
  // Small link at the bottom of the panel: the author's grammar app.
  perapera:'https://play.google.com/store/apps/details?id=com.grcsoft.perapera',
};
module.exports={suggestedDictionaries,installedIds,ankiLinks};
