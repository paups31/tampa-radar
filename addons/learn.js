/* "Be safe and educated" (learn.html): plain-language weather guides, each citing its official sources.
 * Facts were checked against the linked NOAA / NWS / NHC / NSSL / SPC / EPA / AirNow pages (2026-11-23).
 * Guides open from links like learn.html#cape. Numbers are written in US units; addons/units.js converts them
 * when Metric is chosen. */
'use strict';
(() => {
  const NWS = 'National Weather Service', NSSL = 'NOAA National Severe Storms Laboratory', NHC = 'National Hurricane Center',
    SPC = 'NOAA Storm Prediction Center', JS = 'NOAA JetStream (NWS online weather school)', GL = 'NWS Glossary';
  const src = (t, p, u) => ({ t, p, u });
  const S = {
    tornadoWW: src('Tornado Watch vs. Warning', NWS, 'https://www.weather.gov/safety/tornado-ww'),
    tstormWW: src('Severe Thunderstorm Watch vs. Warning', NWS, 'https://www.weather.gov/safety/thunderstorm-ww'),
    defined: src('Warnings, Watches and Advisories Defined', 'NWS Baltimore/Washington', 'https://www.weather.gov/lwx/WarningsDefined'),
    safety: src('Weather Safety', NWS, 'https://www.weather.gov/safety/'),
    tstorm: src('Thunderstorm Safety', NWS, 'https://www.weather.gov/safety/thunderstorm'),
    svr101: src('Severe Weather 101: Thunderstorms', NSSL, 'https://www.nssl.noaa.gov/education/svrwx101/thunderstorms/'),
    tornado: src('Tornado Safety', NWS, 'https://www.weather.gov/safety/tornado'),
    torn101: src('Severe Weather 101: Tornadoes', NSSL, 'https://www.nssl.noaa.gov/education/svrwx101/tornadoes/'),
    ltg: src('Lightning Safety', NWS, 'https://www.weather.gov/safety/lightning-safety'),
    ltgSci: src('Understanding Lightning', NWS, 'https://www.weather.gov/safety/lightning-science-overview'),
    ltg101: src('Severe Weather 101: Lightning', NSSL, 'https://www.nssl.noaa.gov/education/svrwx101/lightning/'),
    hail101: src('Severe Weather 101: Hail', NSSL, 'https://www.nssl.noaa.gov/education/svrwx101/hail/'),
    flood: src('Turn Around, Don’t Drown', NWS, 'https://www.weather.gov/safety/flood-turn-around-dont-drown'),
    floodWW: src('Flood Watch vs. Flood Warning', NWS, 'https://www.weather.gov/safety/flood-watch-warning'),
    flood101: src('Severe Weather 101: Floods', NSSL, 'https://www.nssl.noaa.gov/education/svrwx101/floods/'),
    hurWW: src('Hurricane and Tropical Storm Watches and Warnings', NWS, 'https://www.weather.gov/safety/hurricane-ww'),
    nhcPrep: src('Hurricane Preparedness', NHC, 'https://www.nhc.noaa.gov/prepare/'),
    nhcGloss: src('Glossary of NHC Terms', NHC, 'https://www.nhc.noaa.gov/aboutgloss.shtml'),
    surge: src('Storm Surge (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=storm+surge'),
    rip: src('Rip Current Safety', NWS, 'https://www.weather.gov/safety/ripcurrent'),
    heat: src('What is the Heat Index?', NWS, 'https://www.weather.gov/safety/heat-index'),
    heatWW: src('Heat Watch vs. Warning', NWS, 'https://www.weather.gov/safety/heat-ww'),
    dbz: src('dBZ (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=dbz'),
    radarHow: src('How Radar Works', JS, 'https://www.noaa.gov/jetstream/doppler/how-radar-works'),
    doppler: src('Doppler Radar', JS, 'https://www.noaa.gov/jetstream/doppler-intro'),
    dualpol: src('Dual-Polarization Radar', NSSL, 'https://www.nssl.noaa.gov/tools/radar/dualpol/'),
    cape: src('CAPE (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=CAPE'),
    sbcape: src('Surface-Based CAPE/CIN (mesoanalysis help)', SPC, 'https://www.spc.noaa.gov/exper/mesoanalysis/help/help_sbcp.html'),
    shear: src('Wind Shear (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=wind+shear'),
    supercell: src('Supercell (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=supercell'),
    dew: src('Dew Point vs. Humidity', 'NWS La Crosse, WI', 'https://www.weather.gov/arx/why_dewpoint_vs_humidity'),
    dewG: src('Dew Point (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=dew+point'),
    pres: src('Pressure (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=pressure'),
    uv: src('UV Index Scale', 'U.S. Environmental Protection Agency', 'https://www.epa.gov/sunsafety/uv-index-scale-0'),
    aqi: src('AQI Basics', 'AirNow (EPA and partners)', 'https://www.airnow.gov/aqi/aqi-basics/'),
    fog: src('Fog Safety', NWS, 'https://www.weather.gov/safety/fog'),
    fogAdv: src('Dense Fog Advisory (glossary)', GL, 'https://forecast.weather.gov/glossary.php?word=dense+fog+advisory'),
    tides: src('What are tides?', 'NOAA National Ocean Service', 'https://oceanservice.noaa.gov/facts/tides.html'),
    wind: src('Wind Watches, Warnings and Advisories', NWS, 'https://www.weather.gov/safety/wind-ww'),
  };

  const CATS = [
    ['alerts', '⚠️ Alerts & safety'], ['radar', '📡 Reading the radar'], ['storms', '⛈️ Storm ingredients'],
    ['florida', '🌊 Florida hazards'], ['everyday', '🌤️ Everyday weather'],
  ];

  // body: paragraphs and lists as small HTML snippets (static text written here, no outside input)
  const A = [
    { id: 'watch-warning', cat: 'alerts', icon: '🚦', title: 'Watch vs. warning vs. advisory',
      sum: 'A watch means “be prepared”, a warning means “take action now”.',
      body: `<p>The National Weather Service uses three main levels of alert:</p>
        <ul><li><b>Watch: be prepared.</b> Conditions are right for the hazard to develop. A Tornado Watch means tornadoes are possible in and near the watch area. Keep an eye on the weather and have your plan ready.</li>
        <li><b>Warning: take action.</b> The hazard is happening or about to happen. A Tornado Warning means a tornado has been sighted or indicated by weather radar, and there is imminent danger to life and property. Go to shelter right away.</li>
        <li><b>Advisory: be aware.</b> Less serious conditions that can still be inconvenient or dangerous if you are careless, such as a Dense Fog Advisory.</li></ul>
        <p>The same idea applies to other hazards: a <b>Winter Storm Watch</b> is issued when significant winter weather is possible within 48 hours, and a <b>Winter Storm Warning</b> when it is occurring or imminent.</p>
        <p class="tip"><b>In WeatherBoy:</b> active NWS alerts for your area appear at the top of the home page, red for the most serious.</p>`,
      sources: [S.tornadoWW, S.tstormWW, S.defined] },
    { id: 'severe-thunderstorm', cat: 'alerts', icon: '⛈️', title: 'What makes a thunderstorm “severe”?',
      sum: 'Hail 1 inch or larger, or wind gusts over 58 mph.',
      body: `<p>Every thunderstorm produces lightning, but the NWS calls a storm <b>severe</b> when it can produce <b>hail 1 inch or larger</b> (about the size of a quarter) or <b>wind gusts over 58 mph</b>. A Severe Thunderstorm Warning means severe weather has been reported by spotters or indicated by radar.</p>
        <p>Severe storms can also produce tornadoes, and any storm can cause flash flooding and deadly lightning.</p>
        <p class="do"><b>What to do:</b> go inside a sturdy building, stay away from windows, and keep checking for warnings. Don’t wait for the rain to start.</p>`,
      sources: [S.tstorm, S.tstormWW, S.svr101, S.hail101] },
    { id: 'tornado-safety', cat: 'alerts', icon: '🌪️', title: 'Tornado safety',
      sum: 'Lowest floor, small interior room, away from windows.',
      body: `<p>When a <b>Tornado Warning</b> is issued for your location, act immediately:</p>
        <ul><li>Go to the <b>lowest floor</b> of a sturdy building, into a <b>small interior room</b> (closet, bathroom or hallway) with no windows.</li>
        <li>Get under something sturdy and <b>cover your head and neck</b>.</li>
        <li><b>Mobile homes and cars are not safe</b> in a tornado. Leave for a sturdy building or storm shelter before the storm arrives if you can.</li></ul>
        <p>Tornadoes can form quickly and may be hidden by rain or darkness, so don’t wait to see one.</p>`,
      sources: [S.tornado, S.tornadoWW, S.torn101] },
    { id: 'lightning', cat: 'alerts', icon: '⚡', title: 'Lightning safety',
      sum: 'When thunder roars, go indoors. No place outside is safe.',
      body: `<p>If you can hear thunder, you are close enough to be struck: lightning can strike about <b>10 miles</b> out from a storm, roughly as far as thunder can be heard. A lightning channel heats the air to about <b>50,000°F</b>.</p>
        <ul><li><b>When thunder roars, go indoors.</b> A building with plumbing and wiring, or a hard-topped metal vehicle with the windows up, is safe. Tents, picnic shelters and open porches are not.</li>
        <li>Stay inside until <b>30 minutes after the last thunder</b>.</li>
        <li>Indoors, avoid corded phones, plumbing and electrical equipment during the storm.</li></ul>
        <p class="tip"><b>In WeatherBoy:</b> the Lightning tile shows the nearest strike in the last 15 minutes; within about 10 miles it tells you to stay indoors.</p>`,
      sources: [S.ltg, S.ltgSci, S.ltg101] },
    { id: 'flooding', cat: 'alerts', icon: '🌊', title: 'Floods: turn around, don’t drown',
      sum: 'Six inches of moving water can knock you down; a foot can float a car.',
      body: `<p>Flooding is one of the deadliest weather hazards, and most flood deaths happen in vehicles.</p>
        <ul><li>Just <b>6 inches</b> of fast-moving flood water can knock over an adult.</li>
        <li><b>12 inches</b> of rushing water can carry away most cars, and <b>2 feet</b> can carry away SUVs and trucks.</li>
        <li>You can’t tell how deep water is or whether the road under it has washed away.</li></ul>
        <p>A <b>Flood Watch</b> means flooding is possible; a <b>Flood Warning</b> or <b>Flash Flood Warning</b> means it is happening or about to. Move to higher ground right away.</p>
        <p class="do"><b>What to do:</b> never drive or walk into flood water. <b>Turn around, don’t drown.</b></p>`,
      sources: [S.flood, S.floodWW, S.flood101] },
    { id: 'reflectivity', cat: 'radar', icon: '🌈', title: 'Radar colors and dBZ',
      sum: 'Brighter colors mean more (or bigger) raindrops or hail.',
      body: `<p>Weather radar sends out pulses of energy and listens for what bounces back from rain, hail and snow. That “echo” strength is called <b>reflectivity</b>, measured in <b>dBZ</b>, a logarithmic scale, so each step up means a lot more returned energy.</p>
        <ul><li><b>Blues and greens (about 15–35 dBZ):</b> light to moderate rain.</li>
        <li><b>Yellows and oranges (about 40–50 dBZ):</b> heavy rain.</li>
        <li><b>Reds, pinks and purples (above about 55–60 dBZ):</b> very heavy rain and often hail.</li></ul>
        <p>The beam goes out in a straight line while the Earth curves away below it, so far from the radar it passes <b>over</b> low clouds and rain. On calm, clear nights, faint speckles near the radar are usually insects, birds or ground clutter, not rain.</p>
        <p class="tip"><b>In WeatherBoy:</b> “Rain” in Storm Loop and “Reflectivity” on the radar page show dBZ. The color bar under the map shows the scale.</p>`,
      sources: [S.dbz, S.radarHow, S.doppler] },
    { id: 'velocity', cat: 'radar', icon: '🔴', title: 'Velocity: wind toward and away from the radar',
      sum: 'Green moves toward the radar, red moves away. Bright red next to bright green can mean rotation.',
      body: `<p>Doppler radar can also measure how fast rain and debris are moving <b>toward or away from the radar</b>, using the Doppler shift in the returned signal (like a siren changing pitch as it passes).</p>
        <ul><li><b>Green:</b> moving toward the radar. <b>Red:</b> moving away. Brighter colors mean faster.</li>
        <li>A tight patch of <b>bright red right next to bright green</b> (a “couplet”) shows wind turning in a small area. That is how forecasters spot rotating storms and possible tornadoes.</li>
        <li>The radar only sees motion along its beam, so wind blowing straight across the beam shows up as little or no velocity.</li></ul>
        <p class="tip"><b>In WeatherBoy:</b> choose “Velocity” on the radar page, or “Wind” in Storm Loop.</p>`,
      sources: [S.doppler, S.radarHow] },
    { id: 'dual-pol', cat: 'radar', icon: '🧊', title: 'Dual-pol: telling rain from hail and snow',
      sum: 'The radar measures the shape and size of what it sees.',
      body: `<p>Modern NWS radars are <b>dual-polarization</b>: they send both horizontally and vertically oriented pulses. Comparing the two shows the <b>size and shape</b> of what is in the air, which helps tell <b>rain from hail, snow, ice pellets</b>, birds and insects, and even spot tornado <b>debris</b> lofted into the air.</p>
        <p class="tip"><b>In WeatherBoy:</b> the “Hydrometeor” product and the Rain / Snow / Hail overlays come from this dual-pol classification.</p>`,
      sources: [S.dualpol] },
    { id: 'storm-loop', cat: 'radar', icon: '▶️', title: 'Reading a radar loop',
      sum: 'Loops show where storms have been; warnings tell you where they are going.',
      body: `<ul><li><b>Direction and speed:</b> follow one storm from the oldest frame to the newest to see which way it is moving and how fast.</li>
        <li><b>Growing or weakening:</b> colors getting brighter and larger mean a strengthening storm; fading colors mean it is weakening.</li>
        <li><b>New storms:</b> watch for cells popping up along a line or boundary. They can form right overhead with little warning.</li>
        <li>Storms can turn, split or speed up. For safety decisions, always go by <b>official NWS warnings</b>.</li></ul>
        <p class="tip"><b>In WeatherBoy:</b> open Storm Loop and pick 30 min, 1 h or 2 h; drag along the bar to step through scans.</p>`,
      sources: [S.radarHow, S.safety] },
    { id: 'ingredients', cat: 'storms', icon: '🧪', title: 'What a thunderstorm needs',
      sum: 'Moisture, unstable air and something to lift it, plus wind shear for severe storms.',
      body: `<p>Thunderstorms need three ingredients:</p>
        <ul><li><b>Moisture</b> to form clouds and rain (high dew points).</li>
        <li><b>Instability</b>: warm, moist air near the ground that keeps rising once it starts (measured by <b>CAPE</b>).</li>
        <li><b>Lift</b> to get the air rising: fronts, sea breezes, hills or air flowing over warm ground.</li></ul>
        <p>Add strong <b>wind shear</b> and storms can organize into long-lived severe storms and supercells.</p>`,
      sources: [S.svr101, S.cape, S.shear] },
    { id: 'cape', cat: 'storms', icon: '🎈', title: 'What is CAPE?',
      sum: 'The energy available to storms. Higher CAPE means stronger updrafts.',
      body: `<p><b>CAPE</b> stands for <b>Convective Available Potential Energy</b>, measured in joules per kilogram (J/kg). It measures how much energy a rising bubble of air can gain from the atmosphere, and it is directly related to how fast a storm’s updraft can rise. <b>Higher CAPE means more potential for severe weather.</b></p>
        <p>A common rule of thumb:</p>
        <ul><li><b>Under 1,000 J/kg:</b> weak instability.</li><li><b>1,000–2,500:</b> moderate.</li><li><b>2,500–4,000:</b> strong.</li><li><b>Over 4,000:</b> extreme.</li></ul>
        <p><b>CIN</b> (convective inhibition) is the opposite: a “lid” of stable air that has to be broken before storms can start. High CAPE with a lid can lead to explosive storms later in the day once the lid breaks.</p>
        <p>CAPE alone doesn’t make storms; they still need moisture and lift, and shear to become organized.</p>
        <p class="tip"><b>In WeatherBoy:</b> turn on the CAPE field on the radar page to see where instability is highest.</p>`,
      sources: [S.cape, S.sbcape] },
    { id: 'wind-shear', cat: 'storms', icon: '🌀', title: 'What is wind shear?',
      sum: 'How much the wind changes with height. It helps storms organize and rotate.',
      body: `<p><b>Wind shear</b> is the change in the wind’s <b>speed and direction with height</b>. It is a critical factor in whether severe thunderstorms develop.</p>
        <ul><li>With <b>little shear</b>, storms tend to rain on their own updraft and fade within an hour.</li>
        <li>With <b>more shear</b>, the updraft and downdraft separate, so storms last longer and can organize into lines or <b>supercells</b>, rotating storms that produce most strong tornadoes and large hail.</li></ul>
        <p>WeatherBoy shows <b>0–6 km bulk shear</b>, the wind difference between the ground and about 6 km up. Around <b>35 kt</b> or more supports organized and rotating storms, and around <b>50 kt</b> or more favors supercells, when storms form at all.</p>`,
      sources: [S.shear, S.supercell, S.svr101] },
    { id: 'hurricanes', cat: 'florida', icon: '🌀', title: 'Hurricanes: watches, warnings and surge',
      sum: 'Watches come about 48 hours ahead, warnings about 36 hours ahead.',
      body: `<ul><li><b>Tropical Storm:</b> sustained winds of <b>39 to 73 mph</b>. <b>Hurricane:</b> <b>74 mph</b> or more.</li>
        <li><b>Hurricane Watch:</b> hurricane conditions are possible, issued <b>48 hours</b> before tropical-storm-force winds are expected, because it may not be safe to prepare once those winds arrive.</li>
        <li><b>Hurricane Warning:</b> hurricane conditions are expected, issued <b>36 hours</b> ahead. Finish your preparations and follow evacuation orders.</li>
        <li><b>Storm Surge Warning:</b> danger of life-threatening flooding from rising water moving inland from the shoreline, generally within 36 hours.</li></ul>
        <p><b>Storm surge</b>, the abnormal rise in sea level pushed ashore by the storm, is often the deadliest part of a hurricane. Know your evacuation zone before the season starts.</p>
        <p class="tip"><b>In WeatherBoy:</b> the home page links to the National Hurricane Center.</p>`,
      sources: [S.hurWW, S.nhcPrep, S.nhcGloss, S.surge] },
    { id: 'rip-currents', cat: 'florida', icon: '🏖️', title: 'Rip currents',
      sum: 'If caught, don’t fight it: relax, float, and swim parallel to shore.',
      body: `<p>Rip currents are narrow, fast channels of water flowing away from the beach. They can pull even strong swimmers out, even on sunny days with small waves.</p>
        <ul><li><b>Swim at beaches with lifeguards</b> and check the beach flags and forecast.</li>
        <li>If caught: <b>relax</b> and don’t swim straight back against the current. <b>Float or tread water</b>, and <b>swim parallel to the shore</b> to get out of it, then head in.</li>
        <li>Wave and yell for help. If someone else is caught, get help from a lifeguard or call 911; don’t become a second victim.</li></ul>`,
      sources: [S.rip] },
    { id: 'heat', cat: 'florida', icon: '🥵', title: 'Heat index',
      sum: 'How hot it really feels once humidity is counted.',
      body: `<p>The <b>heat index</b> combines air temperature and humidity into how hot it actually feels, because humid air slows sweat evaporating and cooling you. For example, <b>96°F</b> with <b>65%</b> relative humidity feels like <b>121°F</b>. The heat index is calculated for shade and light wind, so <b>full sun can make it feel even hotter</b>.</p>
        <p class="do"><b>What to do:</b> drink water often, take breaks in shade or air conditioning, check on older neighbors, and <b>never leave children or pets in a parked car</b>.</p>`,
      sources: [S.heat, S.heatWW] },
    { id: 'tides', cat: 'florida', icon: '🌊', title: 'Tides',
      sum: 'Daily rises and falls of the sea caused by the moon and sun.',
      body: `<p>Tides are very long waves that move through the oceans, caused by the <b>gravitational pull of the moon and the sun</b>. As the Earth turns, a coast passes through these bulges of water, giving high and low tides. Many coasts get two highs and two lows a day, while parts of Florida’s Gulf coast can see just one of each on some days.</p>
        <p>Tides matter for boating, fishing and beach walks, and during storms a high tide on top of storm surge makes coastal flooding worse.</p>
        <p class="tip"><b>In WeatherBoy:</b> the Tides tile shows the next highs and lows at St. Petersburg.</p>`,
      sources: [S.tides] },
    { id: 'dew-point', cat: 'everyday', icon: '💧', title: 'Dew point vs. humidity',
      sum: 'Dew point tells you how muggy it really feels.',
      body: `<p>The <b>dew point</b> is the temperature the air would have to cool to for its relative humidity to reach 100%. Unlike relative humidity, it measures the <b>actual moisture</b> in the air, so it tells you how “sticky” it feels.</p>
        <p>Relative humidity can mislead: 30°F with a dew point of 30°F is 100% humidity, while 80°F with a dew point of 60°F is only 50%, yet the 80° day feels far more humid.</p>
        <p>A summer guide from the NWS:</p>
        <ul><li><b>55°F or lower:</b> dry and comfortable.</li><li><b>55–65°F:</b> becoming sticky, with muggy evenings.</li><li><b>65°F or higher:</b> lots of moisture, oppressive.</li></ul>`,
      sources: [S.dew, S.dewG] },
    { id: 'pressure', cat: 'everyday', icon: '🧭', title: 'Air pressure',
      sum: 'Falling pressure often means unsettled weather; rising usually means improving.',
      body: `<p>Air pressure is the weight of the air above you, read by a barometer. WeatherBoy shows <b>sea-level pressure</b> in millibars (the same as hectopascals); a typical value is about <b>1013 mb</b>.</p>
        <ul><li><b>Falling pressure</b> often means a storm system or front is approaching.</li>
        <li><b>Rising pressure</b> usually means drier, more settled weather is on the way.</li>
        <li>Very low pressure is a sign of a strong storm. The strongest hurricanes have the lowest central pressures.</li></ul>
        <p class="tip"><b>In WeatherBoy:</b> the forecast page charts pressure for the next 24 hours and says whether it is rising or falling.</p>`,
      sources: [S.pres] },
    { id: 'uv', cat: 'everyday', icon: '🌞', title: 'UV index',
      sum: 'How strong the sun’s burning rays are today.',
      body: `<p>The UV index forecasts the strength of the sun’s ultraviolet rays, which cause sunburn and skin damage. The EPA scale:</p>
        <ul><li><b>0–2: Low.</b> Little danger for most people.</li><li><b>3–7: Moderate to high.</b> Protection needed: shade around midday, sunscreen, a hat and sunglasses.</li><li><b>8 and above: Very high to extreme.</b> Extra protection needed; avoid the midday sun.</li></ul>
        <p>In Florida the UV index is often high even on cloudy days, and water and sand reflect extra UV.</p>
        <p class="tip"><b>In WeatherBoy:</b> the Sun &amp; UV tile shows the UV index now and today’s peak.</p>`,
      sources: [S.uv] },
    { id: 'aqi', cat: 'everyday', icon: '🍃', title: 'Air quality index (AQI)',
      sum: 'From 0 (clean) to over 300 (hazardous).',
      body: `<ul><li><b>0–50 Good:</b> air quality is satisfactory.</li>
        <li><b>51–100 Moderate:</b> acceptable, though a few unusually sensitive people may be affected.</li>
        <li><b>101–150 Unhealthy for sensitive groups:</b> people with heart or lung disease, older adults and children may feel effects.</li>
        <li><b>151–200 Unhealthy:</b> some of the general public may feel effects.</li>
        <li><b>201–300 Very unhealthy:</b> health alert for everyone.</li>
        <li><b>301 and higher Hazardous:</b> emergency conditions.</li></ul>
        <p>Smoke from wildfires and summer ozone are the most common causes of poor air in Florida.</p>`,
      sources: [S.aqi] },
    { id: 'fog', cat: 'everyday', icon: '🌫️', title: 'Fog',
      sum: 'A cloud at ground level. Dangerous for drivers.',
      body: `<p>Fog is a cloud touching the ground. It forms when air near the surface cools to its dew point, often on clear, calm nights or when warm, moist air moves over cooler water.</p>
        <p>A <b>Dense Fog Advisory</b> is issued when fog cuts visibility to a <b>quarter mile or less</b> over a wide area.</p>
        <p class="do"><b>Driving in fog:</b> slow down, use your <b>low-beam</b> headlights (high beams reflect back), leave extra space, and if you can’t see, pull well off the road.</p>`,
      sources: [S.fog, S.fogAdv] },
    { id: 'wind', cat: 'everyday', icon: '🌬️', title: 'Wind, gusts and wind alerts',
      sum: 'Sustained wind is the average; gusts are the short bursts.',
      body: `<p><b>Sustained wind</b> is the average speed over a minute or two; <b>gusts</b> are brief bursts that can be much stronger and do most of the damage. Wind direction is where the wind is coming <b>from</b>: a west wind blows from the west.</p>
        <p>The NWS issues <b>Wind Advisories</b> and <b>High Wind Warnings</b> when winds are strong enough to make driving hard or bring down trees and power lines.</p>
        <p class="do"><b>What to do:</b> secure outdoor furniture, avoid parking under trees, and stay away from downed power lines.</p>`,
      sources: [S.wind] },
  ];

  // ---------- render ----------
  const $ = id => document.getElementById(id);
  const list = $('lnList'), cats = $('lnCats'), q = $('lnSearch'), none = $('lnNone');
  let cat = 'all';
  cats.innerHTML = [['all', 'All topics'], ...CATS].map(([k, t]) => `<button type="button" data-cat="${k}" class="${k === 'all' ? 'on' : ''}">${t}</button>`).join('');
  const host = u => new URL(u).hostname.replace(/^www\./, '');
  list.innerHTML = CATS.map(([k, t]) => `<section class="ln-group" data-cat="${k}"><h2>${t}</h2>` +
    A.filter(a => a.cat === k).map(a => `<details class="ln-card" id="${a.id}" data-cat="${a.cat}">
      <summary><span class="ln-ico" aria-hidden="true">${a.icon}</span><span class="ln-sumtext"><b>${a.title}</b><span>${a.sum}</span></span><span class="ln-chev" aria-hidden="true">&#x203A;</span></summary>
      <div class="ln-body">${a.body}
        <div class="ln-src"><h3>Sources</h3><ol>${a.sources.map(s => `<li><a href="${s.u}" target="_blank" rel="noopener">${s.t}</a> · ${s.p} <span class="ln-host">(${host(s.u)})</span></li>`).join('')}</ol></div>
        <div class="ln-cardfoot"><a href="#${a.id}" class="ln-link" data-copy="${a.id}">Link to this guide</a></div>
      </div></details>`).join('') + '</section>').join('');

  function filter() {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    list.querySelectorAll('.ln-card').forEach(c => {
      const ok = (cat === 'all' || c.dataset.cat === cat) && (!term || c.textContent.toLowerCase().includes(term));
      c.hidden = !ok; if (ok) shown++;
    });
    list.querySelectorAll('.ln-group').forEach(g => { g.hidden = !g.querySelector('.ln-card:not([hidden])'); });
    none.hidden = shown > 0;
  }
  q.addEventListener('input', filter);
  cats.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cat = b.dataset.cat;
    cats.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    filter();
  });

  // open a guide from the address (learn.html#cape) and keep the address in step when one is opened
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') { el.open = true; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
  }
  list.addEventListener('toggle', e => {
    if (e.target.open && e.target.id) history.replaceState(null, '', '#' + e.target.id);
  }, true);
  list.addEventListener('click', async e => {
    const a = e.target.closest('[data-copy]'); if (!a) return;
    e.preventDefault();
    const url = location.href.split('#')[0] + '#' + a.dataset.copy;
    try {
      if (navigator.share && matchMedia('(max-width: 760px)').matches) await navigator.share({ title: 'WeatherBoy guide', url });
      else { await navigator.clipboard.writeText(url); a.textContent = 'Link copied'; setTimeout(() => { a.textContent = 'Link to this guide'; }, 1800); }
    } catch { /* cancelled */ }
  });
  addEventListener('hashchange', openFromHash);
  openFromHash();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
