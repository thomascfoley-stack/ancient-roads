#!/bin/bash
cd /Users/tfoley/theology-study-app
SECRET=$(grep '^EVAL_HARNESS_SECRET=' web/.env.local | cut -d= -f2- | tr -d '"')
Q=( "what does it mean that Jesus is the good shepherd" "the parable of the prodigal son"
"who was Melchizedek" "justification by faith in Romans" "the fruit of the Spirit"
"what is the meaning of Psalm 23" "Jesus turns water into wine at Cana" "the beatitudes"
"predestination and election" "the armor of God in Ephesians" "who was Nicodemus"
"the day of Pentecost" "love your enemies" "the transfiguration of Jesus"
"what does Genesis say about creation" "the woman at the well" "faith without works is dead"
"the road to Emmaus" )
echo "n=${#Q[@]} queries — warming route..."
curl -s -o /dev/null --max-time 180 -X POST http://localhost:3011/api/eval/bait -H "Content-Type: application/json" -H "Authorization: Bearer $SECRET" -d '{"question":"warmup"}'
declare -a TIMES; comp=0; fb=0; err=0
for q in "${Q[@]}"; do
  t=$(curl -s -o /tmp/b.json -w '%{time_total}' --max-time 180 -X POST http://localhost:3011/api/eval/bait -H "Content-Type: application/json" -H "Authorization: Bearer $SECRET" -d "{\"question\":\"$q\"}")
  kind=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("/tmp/b.json","utf8")).kind)}catch{console.log("err")}')
  TIMES+=("$t")
  case "$kind" in composed) comp=$((comp+1));; fallback) fb=$((fb+1));; *) err=$((err+1));; esac
  printf '  %6.2fs  %-9s %s\n' "$t" "$kind" "$q"
done
node -e '
const t=process.argv.slice(1).map(Number).sort((a,b)=>a-b);
const pct=(p)=>t[Math.min(t.length-1,Math.floor(p/100*t.length))].toFixed(2);
console.log(`\nLATENCY end-to-end /api/ask (bait, dev): n=${t.length} min=${t[0].toFixed(2)} p50=${pct(50)} p90=${pct(90)} p95=${pct(95)} max=${t[t.length-1].toFixed(2)}`);
' "${TIMES[@]}"
echo "OUTCOMES: composed=$comp fallback=$fb err=$err  -> fallback_rate=$(node -e "console.log((($fb)/($comp+$fb+$err)*100).toFixed(1)+'%')")"
