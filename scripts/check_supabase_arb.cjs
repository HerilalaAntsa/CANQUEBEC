const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://kizalwwyuymfugcmpaui.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpemFsd3d5dXltZnVnY21wYXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjE0NDMsImV4cCI6MjA5MjA5NzQ0M30.VFOG3Cx7TUZwnVDM583PVk-yI17Ib0vrUTdJseNIk04'
);
async function main() {
  const { data, error } = await supabase
    .from('matches')
    .select('journee, team_a, team_b, referee, ref1, ref2, coordinator')
    .order('journee', { ascending: true })
    .limit(25);
  if (error) { console.error(error); return; }
  data.forEach(r => console.log(`J${r.journee} ${r.team_a} vs ${r.team_b} | C:${r.referee} | T1:${r.ref1} | T2:${r.ref2} | CO:${r.coordinator}`));
}
main();
