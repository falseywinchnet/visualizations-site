// The worlds the Spider can be set down on. Numbers from .private/spider-drive/offworld-study.md:
// gravity, air and liquid, how the sky and light behave, how dust moves, what the ground is made of.
// Earth is the reference; the others change only what the physics, atmosphere, terrain, effects and
// sound read from here.
export const BODIES={
 earth:{id:'earth',name:'Earth',place:'Country',g:9.81,air:1.2,liquid:{name:'water',rho:1000,label:'Water'},sky:'earth',
  power:'turbo diesel V8',cabin:'open cabin',dust:{mode:'air',color:[.55,.48,.38]},vegetation:true,birds:true,
  layers:{grass:0,dirt:1,sand:3,rock:2,snow:4,verge:6},tint:null},
 moon:{id:'moon',name:'The Moon',place:'Mare crater floor',g:1.62,air:0,liquid:null,sky:'vacuum',
  power:'closed-cycle fuel-cell pack',cabin:'pressurised cabin',dust:{mode:'ballistic',color:[.42,.41,.4]},vegetation:false,birds:false,
  layers:{grass:9,dirt:9,sand:9,rock:10,snow:9,verge:9},tint:[.52,.51,.5],
  light:{sunEl:.27,sunColor:[1,.98,.95],sunI:7.5,hemiSky:[.04,.04,.045],hemiGround:[.3,.29,.28],hemiI:1.1,fog:[0,0,0],fogD:0,exposure:.62,stars:1,earth:true,shadowRadius:1,envI:.05},
  rangeOut:{type:'craterWall'},surfaces:'moon'},
 mars:{id:'mars',name:'Mars',place:'Plains below the Olympus scarp',g:3.71,air:.02,liquid:null,sky:'mars',
  power:'closed-cycle fuel-cell pack',cabin:'pressurised cabin',dust:{mode:'thin',color:[.72,.5,.33]},vegetation:false,birds:false,
  layers:{grass:11,dirt:11,sand:10,rock:10,snow:11,verge:11},tint:[.74,.52,.36],
  light:{sunColor:[1,.9,.78],sunI:4.2,hemiSky:[.62,.42,.26],hemiGround:[.4,.26,.16],hemiI:.9,fog:[.66,.47,.3],fogD:.00013,exposure:.68,stars:.35,shadowRadius:3,envI:.14,
   zenith:[.44,.3,.18],horizon:[.78,.58,.38],sunGlow:[.55,.62,.75],glowW:.08},
  rangeOut:{type:'scarp'},surfaces:'mars'},
 titan:{id:'titan',name:'Titan',place:'Equatorial dune country',g:1.352,air:5.3,liquid:{name:'methane',rho:550,label:'Liquid methane'},sky:'titan',
  power:'closed-cycle fuel-cell pack',cabin:'pressurised, heated cabin',dust:{mode:'dense',color:[.38,.27,.16]},vegetation:false,birds:false,
  layers:{grass:12,dirt:12,sand:12,rock:13,snow:12,verge:12},tint:[.46,.33,.19],
  light:{sunColor:[1,.72,.42],sunI:1.1,hemiSky:[.78,.46,.2],hemiGround:[.3,.2,.1],hemiI:1.5,fog:[.72,.44,.18],fogD:.0012,exposure:.78,stars:0,shadowRadius:12,envI:.3,
   zenith:[.45,.24,.08],horizon:[.86,.54,.22],sunGlow:[1,.8,.5],glowW:.35},
  rangeOut:{type:'dunes'},surfaces:'titan'},
};
export function bodyOf(id){return BODIES[id]||BODIES.earth;}
// surface tables per body (the Earth table lives in terrain.mjs)
export const BODY_SURFACES={
 moon:{
  regolith:{name:'Regolith',mu:.6,slide:.48,roll:.05,soft:.55,dust:1.6,color:[.5,.49,.47]},
  packed:{name:'Packed regolith',mu:.66,slide:.52,roll:.03,soft:.2,dust:.9,color:[.46,.45,.43]},
  rock:{name:'Basalt',mu:.78,slide:.62,roll:.02,soft:0,dust:.3,color:[.3,.29,.28]},
  ejecta:{name:'Ejecta',mu:.62,slide:.5,roll:.06,soft:.5,dust:1.4,color:[.58,.57,.55]},
 },
 mars:{
  dust:{name:'Dust',mu:.55,slide:.42,roll:.07,soft:.7,dust:1.8,color:[.72,.5,.33]},
  duricrust:{name:'Duricrust',mu:.68,slide:.54,roll:.03,soft:.2,dust:.9,color:[.66,.46,.3]},
  sand:{name:'Basaltic sand',mu:.52,slide:.42,roll:.11,soft:.9,dust:1.2,color:[.35,.3,.26]},
  rock:{name:'Basalt',mu:.8,slide:.64,roll:.02,soft:0,dust:.3,color:[.42,.34,.28]},
  track:{name:'Graded track',mu:.74,slide:.6,roll:.03,soft:.1,dust:.8,color:[.62,.44,.3]},
 },
 titan:{
  sand:{name:'Organic sand',mu:.5,slide:.4,roll:.1,soft:.85,dust:1.1,color:[.36,.26,.15]},
  flats:{name:'Ice cobbles',mu:.58,slide:.45,roll:.06,soft:.25,dust:.4,color:[.6,.47,.3]},
  damp:{name:'Damp sand',mu:.46,slide:.36,roll:.1,soft:.95,dust:0,color:[.3,.22,.13]},
  rock:{name:'Water ice bedrock',mu:.55,slide:.42,roll:.02,soft:0,dust:.1,color:[.62,.52,.38]},
  bed:{name:'Lake bed',mu:.4,slide:.32,roll:.08,soft:.7,dust:0,color:[.28,.2,.12]},
  track:{name:'Graded track',mu:.6,slide:.48,roll:.04,soft:.15,dust:.5,color:[.5,.38,.24]},
 },
};
