import fs from 'node:fs';
const [file,watch,node,home,app,port]=process.argv.slice(2);
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const env={REAPPLE_NODE:node,REAPPLE_HOME:home,REAPPLE_APP:app,REAPPLE_PORT:port,REAPPLE_LOG:home+'/agent.log',PATH:'/usr/bin:/bin:/usr/sbin:/sbin'};
fs.writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.reapple.music</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>${xml(watch)}</string></array>
<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer><key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(home+'/agent.out.log')}</string>
<key>StandardErrorPath</key><string>${xml(home+'/agent.err.log')}</string>
</dict></plist>
`);
