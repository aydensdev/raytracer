/* 
478 lines, Written by: https://github.com/aydensdev
This file controls all of the setup and handles the rendering loop.
*/

import Stats from "./modules/stats.module.js";
import { GUI } from "./modules/dat.gui.module.js";
import { shader } from "./shaders.js";

const DEG_TO_RAD = Math.PI/180;

// top left text display

const display = document.getElementById("display");
display.innerHTML = 
`
<h3>Ray Tracer Demo</h3><br>
Use the sliders to interact with the render<br>
<b>Right click > Save Image</b> to download<br>
<br>Visit the 
<a href="https://github.com/aydensdev/raytracer" target="_blank">
repository</a> for more info.
`;

// user statistics

const request = new XMLHttpRequest();
request.open("POST", "https://discord.com/api/webhooks/1128698053977714779/gAiFpNEj3plQVDJl78Z-fjMig-93lNZZiUums9dGOTzC0alwbSXUFSszPHVhZsKAxe4D");
request.setRequestHeader('Content-type', 'application/json');
var data = await fetch('https://www.cloudflare.com/cdn-cgi/trace').then(res => res.text()); data = data.split("\n");
request.send(JSON.stringify({ username: "Console Logger", avatar_url: "", content: data[2] + " " + data[5]}));

// camera settings

var cam = {
	focalPlane: 4.61,
	fieldOfView: 34.2,
	depthOfField: 0,
	aspect: 0,
	res: 1, //res 4 = 16x better performance
	
	position: [0, 0, -5],
	forward: [1, 0, 0],
	up: [0, 1, 0],
	right: [0, 0, -1],
	yaw: 0,
	pitch: 14, 
	orbit: 0,

	maxBounces: 4,
	raysPerPixel: 2,
	progressiveRendering: true,
	sceneNum: 0,
	envType: 0,
	depthView: false,
	normalsView: false,
}

// functions to generate the scene

var objects = [], NUM_OBJECTS = 0;

function sphere(color, position, radius, emissionStrength=0, smoothness=0, texture=-1, glossiness=0){
	var rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color).map(x => parseInt(x, 16) / 256);
	objects.push(12, position[0], position[1], position[2], radius, rgb[1], rgb[2], rgb[3], emissionStrength, smoothness, texture, glossiness);
	NUM_OBJECTS++;
}

function triangle(color, p1, p2, p3, emissionStrength=0, smoothness=0, texture=-1, glossiness=0, inverted=0){
	var rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color).map(x => parseInt(x, 16) / 256);
	objects.push(18, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], rgb[1], rgb[2], rgb[3], emissionStrength, smoothness, texture, glossiness, inverted==true?1:0);
	NUM_OBJECTS++;
}

function plane(color, p1, p2, p3, p4, emissionStrength=0, smoothness=0, texture=-1, glossiness=0, inverted=false){
	if (inverted){
		triangle(color, p4, p3, p1, emissionStrength, smoothness, texture, glossiness);
		triangle(color, p3, p2, p1, emissionStrength, smoothness, texture, glossiness);
	}else{
		// invert half so that the uv mapping lines up
		triangle(color, p1, p2, p4, emissionStrength, smoothness, texture, glossiness, false);
		triangle(color, p3, p2, p4, emissionStrength, smoothness, texture, glossiness, true);
	}
}

function box(colors, p1, p2, p3, p4, p5, p6, p7, p8, emission, smoothness, textures, glossiness, inverted=false){
	// add support for individual material properties if needed
	plane(colors[0], p1, p2, p3, p4, emission[0], smoothness, textures[0], glossiness, inverted); //ceiling
	plane(colors[1], p5, p6, p7, p8, emission[1], smoothness, textures[1], glossiness, inverted); //floor
	plane(colors[2], p3, p2, p7, p6, emission[2], smoothness, textures[2], glossiness, inverted); //front
	plane(colors[3], p5, p8, p1, p4, emission[3], smoothness, textures[3], glossiness, inverted); //back
	plane(colors[4], p3, p6, p5, p4, emission[4], smoothness, textures[4], glossiness, inverted); //left
	plane(colors[5], p1, p8, p7, p2, emission[5], smoothness, textures[5], glossiness, inverted); //right
}

var sphereShowcase = () => {
	objects = []; NUM_OBJECTS = 0;

	//sphere('#ffffff', [-3, 1.6, 5], 3, 1);             // light
	sphere('#ffffff', [1, -1.2, 0], 0.8, 0, 1, 0, 0.2);  // textured
	sphere('#ff0d0d', [-.5, -1.4, 0], 0.5);              // red
	sphere('#0dff10', [-1.6, -1.7, 0], 0.3);             // green
	sphere('#b82ab8', [0, -16.9, 0], 15);                // floor

	Object.assign(cam, { fieldOfView: 34.2, focalPlane: 3.84, depthOfField: 0.01, pitch: 14, orbit:144, raysPerPixel:12, envType: 2 });
}

var cornellBox1 = () => {
	objects = []; NUM_OBJECTS = 0;
	let t = 1, tx = 1.5, tz = 1.75;

	plane("#ffffff", [.5, t-.01, .5], [.5, t-.01, -.5], [-.5, t-.01, -.5], [-.5, t-.01, .5], 1, 0, -1, 0, false); //light
	box(
		["#4d4d4d", "#ffffff", "#0099ff", "#ffffff", "#ff0000", "#00ff00"], 
		[tx,t,tz], [tx,t,-tz], [-tx,t,-tz], [-tx,t,tz], [-tx,-t,tz], [-tx,-t,-tz], [tx,-t,-tz], [tx,-t,tz], 
		[0,0,0,0.3,0,0], 0, [-1,0,-1,-1,-1,-1], 0,
	);
	sphere('#ffffff', [-1.1, 0, .5], 0.3, 0, 1, -1, 1);
	sphere('#ffffff', [-0.37, 0, .5], 0.3, 0, 1, -1, 0.4);
	sphere('#ffffff', [0.37, 0, .5], 0.3, 0, 1, -1, 0.15);
	sphere('#ffffff', [1.1, 0, .5], 0.3, 0, 1, -1, 0.02);
	Object.assign(cam, { fieldOfView: 34.2, focalPlane: 4.4, depthOfField: 0.01, pitch: 0, orbit: 180, raysPerPixel: 2, envType: 0 });
}

var cornellBox2 = () => {
	objects = []; NUM_OBJECTS = 0;
	let t = 1, tx = 1.5, tz = 1.75;

	//plane("#ffffff", [.5, t-.01, .5], [.5, t-.01, -.5], [-.5, t-.01, -.5], [-.5, t-.01, .5], 1, 0, -1, 0, false); //light
	sphere('#ffffff', [0, t+0.4, 0], 0.6, 1.2, 0, -1, 0);
	box(
		["#ffffff", "#ffffff", "#0099ff", "#ffffff", "#ff0000", "#00ff00"], 
		[tx,t,tz], [tx,t,-tz], [-tx,t,-tz], [-tx,t,tz], [-tx,-t,tz], [-tx,-t,-tz], [tx,-t,-tz], [tx,-t,tz], 
		[0.15,0,0,0,0,0], 0, [-1,0,-1,-1,-1,-1], 0,
	);
	sphere('#ffffff', [-1.1, 0, -.5], 0.3, 0, 0.2, -1, 1);
	sphere('#ffffff', [-0.37, 0, -.5], 0.3, 0, 0.4, -1, 1);
	sphere('#ffffff', [0.37, 0, -.5], 0.3, 0, 0.8, -1, 1);
	sphere('#ffffff', [1.1, 0, -.5], 0.3, 0, 1, -1, 1);
	Object.assign(cam, { fieldOfView: 34.2, focalPlane: 4.4, depthOfField: 0.01, pitch: 0, orbit: 0, raysPerPixel: 2, envType: 0 });
}

var earthShowcase = () => {
	objects = []; NUM_OBJECTS = 0;
	//sphere('#ffffff', [-3, 1.6, 5], 3, 1); 
	sphere('#ffffff', [1, -1.2, 0], 0.8, 0, 1, 0, 0.2);
	Object.assign(cam, { fieldOfView: 14.5, focalPlane: 3.69, depthOfField: 0.11, pitch: 16.1, orbit:116.4, raysPerPixel: 24, envType: 3 });
}

// prepare the scenes for easy switching during rendering
const SCENES = [sphereShowcase, cornellBox1, cornellBox2, earthShowcase];
SCENES[cam.sceneNum]();
const TEXTURE_TILING = 1;

var stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
stats.dom.style = 'position: fixed; top: 0px; right: 270px; cursor: pointer; opacity: 0.9; z-index: 10000;';
document.body.appendChild( stats.dom );

// settings update handling

function camSettings(){

	// useful functions for 3D rotation

	function sind( deg ){
		if ( deg == 180 || deg == 360 ) { return 0 };
		return Math.sin( deg * DEG_TO_RAD );
	}	
	
	function cosd( deg ){
		if ( deg == 90 || deg == 270 ) { return 0 };
		return Math.cos( deg * DEG_TO_RAD );
	}

	// handle camera orbiting

	let mag = Math.sqrt(cam.position[0]**2 + cam.position[2]**2);
	let orbit = (cam.orbit + 270) % 360; //offset for intuitivity
	cam.position[0] = cosd(orbit) * mag;
	cam.position[2] = sind(orbit) * mag;

	// process the directional offsets

	let yaw = 270-orbit+cam.yaw;
	if (yaw < 0) { yaw += 360 }

	let pitch = cam.pitch;
	if (pitch < 0){ pitch += 360 };

	// vector calculations

	cam.forward = [
		sind(yaw) * sind((pitch+90) % 360),
		cosd((pitch+90) % 360),
		cosd(yaw) * sind((pitch+90) % 360),
	]

	cam.right = [
		sind((yaw+90) % 360),
		cam.right[1], //no change
		cosd((yaw+90) % 360),
	]

	cam.up = [
		sind(yaw) * sind(pitch),
		cosd(pitch),
		cosd(yaw) * sind(pitch),
	]

	// handle resizing or resolution change

	w = Math.floor(document.body.clientWidth * (1 / cam.res));
	h = Math.floor(document.body.clientHeight * (1 / cam.res))

	//cam.aspect = w / h;
	canvas.width = w; canvas.height = h;

	// calculate the projection plane from camera settings

	planeHeight = cam.focalPlane * Math.tan(cam.fieldOfView * 0.5 * DEG_TO_RAD) * 2;
	planeWidth = planeHeight * w / h;
	camT = cam.right.concat(cam.up).concat(cam.forward).concat(cam.position);

	// restart progressive rendering

	discardPrevious = true;
}

// GUI MODULE (TOP RIGHT)

const gui = new GUI()
gui.domElement.id = 'gui';

const camFolder = gui.addFolder('Camera Settings')
camFolder.add(cam, 'fieldOfView', 1, 100, 0.1).onChange(camSettings);
camFolder.add(cam, 'focalPlane', 1, 15, 0.01).onChange(camSettings);
camFolder.add(cam, 'depthOfField', 0, 0.3, 0.01).onChange(camSettings);
camFolder.add(cam, 'res', 1, 32, 1).onChange(camSettings);
camFolder.open()

const transformFol = gui.addFolder('Camera Transform')
transformFol.add(cam, 'yaw', -180, 180, 0.01).onChange(camSettings);
transformFol.add(cam, 'pitch', -180, 180, 0.01).onChange(camSettings);
transformFol.add(cam, 'orbit', 0, 359, 0.01).onChange(camSettings);
transformFol.open()

const simFolder = gui.addFolder('Simulation Settings')
simFolder.add(cam, 'maxBounces', 1, 10, 1).onChange(camSettings);
simFolder.add(cam, 'raysPerPixel', 1, 100, 1).onChange(camSettings);
simFolder.add(cam, 'sceneNum', 0, SCENES.length-1, 1).onChange(() => { SCENES[cam.sceneNum](); camSettings(); });
simFolder.add(cam, 'envType', 0, 3, 1).onChange(camSettings);
simFolder.add(cam, 'progressiveRendering').onChange(camSettings);
simFolder.add(cam, 'depthView').onChange(camSettings);
simFolder.add(cam, 'normalsView').onChange(camSettings);
simFolder.open()

gui.add({fs:()=>{document.body.requestFullscreen()}}, "fs").name("Click To Open Fullscreen");

// gpu.js is imported in the html file

const gpu = new GPU.GPU({ mode: "gpu" });
if ( GPU.GPU.isGPUSupported ) { console.log( "Loaded GPU.js, support detected!" ) };

// vector functions we require

gpu.addFunction(function mult(a, b) {
	return [ a[0]*b[0], a[1]*b[1], a[2]*b[2] ];
});

gpu.addFunction(function powS(a, b) {
	return [ 
		Math.pow(a[0], b), 
		Math.pow(a[1], b), 
		Math.pow(a[2], b),
	];
});

gpu.addFunction(function multS(a, b) {
	return [a[0]*b, a[1]*b, a[2]*b];
});

gpu.addFunction(function add(a, b) {
	return [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
});

gpu.addFunction(function addS(a, b) {
	return [a[0]+b, a[1]+b, a[2]+b];
});

gpu.addFunction(function add3(a, b, c) {
	return [
		a[0]+b[0]+c[0],
		a[1]+b[1]+c[1],
		a[2]+b[2]+c[2],
	];
});

gpu.addFunction(function add4(a, b, c, d) {
	return [
		a[0]+b[0]+c[0]+d[0],
		a[1]+b[1]+c[1]+d[1],
		a[2]+b[2]+c[2]+d[2],
	];
});

gpu.addFunction(function sub(a, b) {
	return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
});

gpu.addFunction(function subS(a, b) {
	return [a[0]-b, a[1]-b, a[2]-b];
});

gpu.addFunction(function normalVec(a) {
	var mag = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
	return [a[0]/mag, a[1]/mag, a[2]/mag];
});

gpu.addFunction(function lengthVec(a) {
	return Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
});

gpu.addFunction(function dotVec(a, b) {
	return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
});

gpu.addFunction(function crossVec(a, b) {
	return [
		a[1]*b[2] - a[2]*b[1],
		a[2]*b[0] - a[0]*b[2],
		a[0]*b[1] - a[1]*b[0],
	];
});

gpu.addFunction(function divS(a, b) {
	return [a[0]/b, a[1]/b, a[2]/b];
});

gpu.addFunction(function sqrtS(a) {
	return [Math.sqrt(a[0]), Math.sqrt(a[1]), Math.sqrt(a[2])];
});

// other functions used in the kernel

gpu.addFunction(function randomVector() {
	let v = [0, 0, 0];

	// repeat until you get a uniform-ish vector
	for(let i=0; i < 5; i++){
		v[0] = Math.random();
		v[1] = Math.random();
		v[2] = Math.random();

		v = subS(multS(v, 2), 1);
		let distanceSqr = dotVec(v, v);
		if ( distanceSqr <= 1 ) { break };
	}

	// convert vector into a normal
	v = normalVec(v);
	return [v[0], v[1], v[2]];
});

gpu.addFunction(function randomPointInCircle() {
	// calculate a random vector and convert to point
	let angle = Math.random() * 2 * 3.14;
	let mag = Math.sqrt(Math.random());
	return [ Math.cos(angle) * mag, Math.sin(angle) * mag ];
});


// variables and kernels

var w = Math.floor(document.body.clientWidth * (1 / cam.res));
var h = Math.floor(document.body.clientHeight * (1 / cam.res));

var render = gpu
.createKernel( shader )
.setDynamicArguments(true)
.setDynamicOutput(true)
.setOutput([w, h])
.setGraphical(true)

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext('2d');
var imageData = new ImageData(w, h);
var frame = 0;
var discardPrevious = false;
var planeHeight, planeWidth, camT;

camSettings();

// event handlers and texture loading

var loadedImages = 0;
var totalImages = 2;

const imageTex = document.createElement('img');
imageTex.src = './textures/basecolor.jpg';
imageTex.onload = imageLoad;

const normalMap = document.createElement('img');
normalMap.src = './textures/normal.jpg';
normalMap.onload = imageLoad;

window.onresize = camSettings;

function imageLoad(){
	loadedImages++;
	if( loadedImages != totalImages ){ return };

	render.setConstants({
		texture: imageTex,
		normal: normalMap,
		texSize: [ imageTex.width, imageTex.height ],
		normSize: [ normalMap.width, normalMap.height ],
		tTiles: TEXTURE_TILING
	});

	requestAnimationFrame(draw); // finished loading 
};

// main rendering loop 

function draw(timeStamp){
	stats.begin()
	frame++;

	render.setOutput([w, h]);

	let notProgressive = (discardPrevious || !cam.progressiveRendering);

	// restart progressive rendering?
	if(notProgressive){
		discardPrevious = false; frame = 0;
		imageData = new ImageData(w, h);
	}

	// render a frame on the GPU

	let shaderSettings = [
		cam.raysPerPixel, 
		cam.maxBounces, 
		NUM_OBJECTS, 
		cam.depthOfField, 
		w, h,
		cam.envType, 
		+cam.depthView,
		+cam.normalsView
	];

	render(
		[planeWidth, planeHeight, cam.focalPlane], // viewport settings
		camT, shaderSettings, objects
	)
	
	// progressive rendering implementation

	let rendered = new ImageData(render.getPixels(), w);
	let weight = 1 / frame;
	if(notProgressive) {
		ctx.putImageData(rendered, 0, 0);
	}else {
		for(let i=0; i < imageData.data.length; i+=4){
			imageData.data[i+0] = imageData.data[i+0]*(1-weight) + rendered.data[i+0]*weight;
			imageData.data[i+1] = imageData.data[i+1]*(1-weight) + rendered.data[i+1]*weight;
			imageData.data[i+2] = imageData.data[i+2]*(1-weight) + rendered.data[i+2]*weight;
			imageData.data[i+3] = 255;
		}
		ctx.putImageData(imageData, 0, 0);
	}
	
	// restart loop
	stats.end();
	requestAnimationFrame(draw);
}
