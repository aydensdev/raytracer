function shader ( uv_to_plane, camT, settings, objects ){ //imageTex, normalTex, imageDimensions, normalDimensions, tileLen ) {
	/* Math.random(); <= removing this comment breaks everything ?? 
	I blame GPU.js for this but its tolerable for now*/

	// settings

	var PI = 3.141592;

	var raysPerPixel = settings[0];
	var maxBounces = settings[1];
	var numObjects = settings[2];
	var focalBlur = settings[3];
	var dimensions = [settings[4], settings[5]];

	var env_mode = settings[6];
	var depthMapView = settings[7]==1 ? true:false ; // visualizations for debugging
	var normalMapView = settings[8]==1 ? true:false ;

	// base variables
	var w = dimensions[0], h = dimensions[1];
	var x = this.thread.x, y = this.thread.y;
	var u = x / w, v = y / h;

	// [UNUSED] iterate the prng to get a very random seed
	//var seed = prng(prng(((x+14)*(y+23)+frame)/(w+h))*(x+6534.597)-y) * (y+4);
	
	let matrix = [uv_to_plane[0], uv_to_plane[1], uv_to_plane[2]];

	// generate a viewpoint
	var viewPointLocal = mult([u - 0.5, v - 0.5, 1], matrix);
	var origin = [camT[9], camT[10], camT[11]];

	// generate vec3 arrays and add them
	var tRight = multS([camT[0], camT[1], camT[2]], viewPointLocal[0]);
	var tUp = multS([camT[3], camT[4], camT[5]], viewPointLocal[1]);
	var tForward = multS([camT[6], camT[7], camT[8]], viewPointLocal[2]);
	var viewPoint = add4(origin, tRight, tUp, tForward);

	function smoothStep(lower, upper, t){
		let x = (t-lower) / (upper-lower);
		if ( x < 0 ) { x = 0 };
		if ( x > 1 ) { x = 1 };
		return x * x * (3 - 2*x); 
	}

	function lerpS3(vec1, vec2, t){
		return [
			vec1[0] + (vec2[0]-vec1[0]) * t,
			vec1[1] + (vec2[1]-vec1[1]) * t,
			vec1[2] + (vec2[2]-vec1[2]) * t,
		]
	}
	
	// mult() gives an error for some reason?? 
	// only the internal function worked
	function multiply(a, b) {
		return [
			a[0]*b[0], 
			a[1]*b[1], 
			a[2]*b[2]
		];
	};

	var totalLight = [0, 0, 0];

	// limit the rays if just visualizing
	var MaxRays = (depthMapView || normalMapView) ? 1 : raysPerPixel;
	
	for(var rayNum = 0; rayNum < MaxRays; rayNum++) {
		
		// generate a ray with some jitter

		let aliasBlur = 0;//4e-3; // anti-aliasing
		var jitter = randomPointInCircle();
		var rightJitter = multS([camT[0], camT[1], camT[2]], jitter[0] * aliasBlur);
		var upJitter = multS([camT[3], camT[4], camT[5]], jitter[1] * aliasBlur);
		var jitteredViewPoint = add3(viewPoint, rightJitter, upJitter);

		var defocusJitter = randomPointInCircle(); // lens focus blur
		rightJitter = multS([camT[0], camT[1], camT[2]], defocusJitter[0] * focalBlur);
		upJitter = multS([camT[3], camT[4], camT[5]], defocusJitter[1] * focalBlur);

		var origin = add3([camT[9], camT[10], camT[11]], rightJitter, upJitter);
		var dir = normalVec(sub(jitteredViewPoint, origin));
		var rayColor = [1, 1, 1];
		var incomingLight = [0, 0, 0];

		for(let i = 0; i < maxBounces; i++){

			// store the hit info in vectors
			
			var closestInfo = [ 0, 9999 ];  // hit?, distance
			var closestHit = [0, 0, 0];     // hit point vector3
			var closestNormal = [0, 0, 0];  // normal vector3
			var closestColor = [0, 1, 0];   // color vector3
			var closestMat = [0, 0, 0, 0];  // emmision, smoothness, texture?, gloss

			// loop on all objects in scene

			let ep = 2.220446049250313e-16; // Number.EPSILON returns this value
			var index = 0;

			for(let obj = 0; obj < numObjects; obj += 1){
				
				// how many elements to read?

				var objectType = objects[index];
				var tempInfo = [0, 9999];

				// sphere handling (12 elements)
			
				if (objectType == 12){
					let s = index; // short form for easier access
					var position = [objects[s+1], objects[s+2], objects[s+3]];
					var radius = objects[s+4];
					let offset = sub(origin, position);
					let a = dotVec(dir, dir);
					let b = 2 * dotVec(offset, dir);
					let c = dotVec(offset, offset) - (radius*radius);
					let discriminant = (b * b) - (4 * a * c);
					let dst = ( -b - Math.sqrt(discriminant) ) / ( 2 * a );

					// if we hit a sphere at all update the distance

					if (discriminant >= 0 && dst > 0) { tempInfo = [1, dst] };

					// if this object is the closest so far update everything

					if ( tempInfo[1] < closestInfo[1] ) { 
						closestInfo = tempInfo; 
						closestHit = add(origin, multS(dir, dst));
						closestNormal = normalVec(sub(closestHit, position));
						closestColor = [objects[s+5], objects[s+6], objects[s+7]];
						closestMat = [objects[s+8], objects[s+9], objects[s+10], objects[s+11]];
	
						// sphere UV mapping for closestColor and closestNormal

						if (closestMat[2] != -1){
							// uv map the hit point
							let sphereU = ( Math.atan2(closestNormal[0], closestNormal[2]*-1) / PI + 0.5) / 2; // 0 to 0.5
							if(closestNormal[2] > 0){ sphereU += 0.5 }; // 0.5 to 1
							let sphereV = (0.5 + Math.asin(closestNormal[1]) / PI);
	
							let tileLen = this.constants.tTiles;
							let pixel = [0, 0, 0, 0], width = 0, height = 0;
							let coordX = ((sphereU*tileLen) % 1), coordY = ((sphereV*tileLen) % 1);
	
							// sample the texture 
							//width = imageDimensions[0], height = imageDimensions[1];
							//pixel = imageTex[coordY*height][coordX*width];

							width = this.constants.texSize[0], height = this.constants.texSize[1];
							pixel = this.constants.texture[coordY*height][coordX*width];
							closestColor = [pixel[0], pixel[1], pixel[2]];

							// sample the normal map
							width = this.constants.normSize[0], height = this.constants.normSize[1];
							pixel = this.constants.normal[coordY*height][coordX*width];
							pixel = [pixel[0]+ep, pixel[1]+ep, pixel[2]+ep, pixel[3]]; // prevent division by 0
							closestNormal = normalVec([closestNormal[0]/pixel[0], closestNormal[1]/pixel[1], closestNormal[2]/pixel[2]]); 
						};
					};
				};

				// triangle handling (18 elements)

				if (objectType == 18) {
					let s = index;
					let inverted = objects[s+17];

					let posA = [objects[s+1], objects[s+2], objects[s+3]];
					let posB = [objects[s+4], objects[s+5], objects[s+6]];
					let posC = [objects[s+7], objects[s+8], objects[s+9]];

					let edgeAB = sub(posB, posA);
					let edgeAC = sub(posC, posA);
					let N = normalVec(crossVec(edgeAB, edgeAC));
				
					let nDotDir = dotVec(N, dir), dst = -1;
					let d = dotVec(N, posA) * -1;

					tempInfo[0] = 1; // assume a hit until proven wrong

					dst = ((dotVec(N, origin)+d)*-1) / nDotDir;
					if (dst < 0) { tempInfo[0] = 0 }; // culling of some kind??

					let hitPoint = add(origin, multS(dir, dst));
					let c = [0, 0, 0]; // array used to compare

					// edge 0 already calculated
					let vpAP = sub(hitPoint, posA);
					c = crossVec(edgeAB, vpAP);
					if (dotVec(N, c) < 0) { tempInfo[0] = 0 };

					// edge 1
					let edgeBC = sub(posC, posB);
					let vpBC = sub(hitPoint, posB);
					c = crossVec(edgeBC, vpBC);
					if (dotVec(N, c) < 0) { tempInfo[0] = 0 };

					// edge 2
					let edgeCA = sub(posA, posC);
					let vpCA = sub(hitPoint, posC);
					c = crossVec(edgeCA, vpCA);
					if (dotVec(N, c) < 0) { tempInfo[0] = 0 };

					if(nDotDir > ep){ 
						N = normalVec(multS(N, -1));
						if(inverted == 1){ tempInfo[0] = 0 };
					}else{
						if(inverted == 0){ tempInfo[0] = 0 };
					};

					// yes we did hit a triangle, update the distance
					if ( tempInfo[0] == 1 ) { tempInfo = [1, dst] };

					// uv mapping
					let area = lengthVec(crossVec(edgeAB, edgeAC)) / 2;
					let u = lengthVec(crossVec(vpCA, edgeAC)) / (2 * area);
					let v = lengthVec(crossVec(vpAP, edgeAB)) / (2 * area);
					let w = 1-u-v;

					// this is the closest to camera, update the rest
					if(tempInfo[1] < closestInfo[1]){
						closestInfo = tempInfo; 
						closestHit = hitPoint;
						closestNormal = N;
						closestColor = [objects[s+10], objects[s+11], objects[s+12]];
						closestMat = [objects[s+13], objects[s+14], objects[s+15], objects[s+16]]; // emmision, smoothness, texture?, gloss

						// checker texture
						if(closestMat[2] != -1){
							let checkers = 12.57;
							let sines = Math.sin(checkers*u)*Math.sin(checkers*v);
							if(sines > 0){ 
								closestColor = [.08, .08, .08];
								closestMat = [0, 0, -1, 0];
							}else{
								closestColor = [1, 1, 1];
								closestMat = [0.1, 0.4, -1, 1];
							}
						}
					}
				}

				// move the index to the next object or material in array

				index += objectType;
			}

			// we have hit info, now trace the ray

			if(closestInfo[0] == 1){
				let emissionStr = closestMat[0];
				let smoothness = closestMat[1];
				let specularProbability = closestMat[3];
				let color = [closestColor[0], closestColor[1], closestColor[2]];

				// calculate specular + diffuse bounce directions
				let diffuseDir = normalVec(add(closestNormal, randomVector()));
				let specularDir = sub(dir, multS(closestNormal, 2 * dotVec(dir, closestNormal)));

				// update the ray origin + dir for next bounce
				origin = closestHit;
				let isSpecularBounce = (specularProbability > Math.random(seed)) ? 1 : 0;
				
				dir = lerpS3([diffuseDir[0], diffuseDir[1], diffuseDir[2]], specularDir, smoothness*isSpecularBounce);

				// update the incoming light and ray color for next bounce
				let emittedLight = multS(color, emissionStr); 
				incomingLight = add(incomingLight, multiply(emittedLight, rayColor));
				rayColor = multiply(rayColor, lerpS3(color, [1, 1, 1], isSpecularBounce));

				// complete light sources shouldn't reflect
				if (emissionStr == 1){ break };
			}else{

				// if ray does not hit anything, add env lighting (completely optional)

				let envColor = [0, 0, 0];

				if (env_mode == 1) { 
					let skyDown = [.5, .7, 1], skyUp = [.07, .36, .72];
					envColor = lerpS3(skyDown, skyUp, dir[1]);
				} else if (env_mode == 2 || env_mode == 3){
					let SUN_FOCUS = 150, SUN_INT = 100;
					let SUN_DIR = normalVec([-.2, .2, .7]);
					let skyDown = [1, 1, 1], skyUp = [.07, .36, .72];

					//let groundColor = [.35, .3, .35];
					//let sky0 = multS([0.8, 0.9, 1], 1-t);
					//let sky1 = multS([0.3, 0.5, 1], t);
					//let skyDown = [0.8, 0.9, 1], skyUp = [0, 0.1, 0.6];
					//let skyGradient = Math.pow(smoothStep(0, 0.4, dir[1]), 0.35);

					let skyGradient = (dir[1]*1.2)+0.55;
					let skyColor = lerpS3(skyDown, skyUp, skyGradient);
					let sun = Math.pow(Math.max(0, dotVec(dir, SUN_DIR)), SUN_FOCUS) * SUN_INT;
	
					//let groundGradient = 1;//smoothStep(-0.01, 0, dir[1]);
					//let blend = lerpS3(groundColor, skyColor, groundGradient);

					if (env_mode == 3){
						envColor = [sun, sun, sun]; // "space" mode
					} else {
						envColor = addS(skyColor, sun);
					}
				}
				
				let light = multiply(envColor, rayColor);
				incomingLight = add(incomingLight, light);

				if(!depthMapView && !normalMapView){ break };
			}
			
			// just visualise the distance of each hitPoint
			if(depthMapView){
				let depth = 1-closestInfo[1]/20;
				totalLight = [depth, depth, depth];
				incomingLight = [0, 0, 0];
				rayColor = [0, 0, 0];
				break;

			}else if(normalMapView){
				totalLight = [closestNormal[0], closestNormal[1], closestNormal[2]];
				incomingLight = [0, 0, 0];
				rayColor = [0, 0, 0];
				break;

			}
		}

		totalLight = add(totalLight, incomingLight);
	}

	totalLight = powS(divS(totalLight, MaxRays), 0.6); // gamma correction, if needed

	//return [totalLight[0], totalLight[1], totalLight[2]];
	this.color(totalLight[0], totalLight[1], totalLight[2], 1);
}

function postShader ( inputTex, w, h, frame ){
	// the input texture only updates when a GUI update is called

	// base variables
	var x = this.thread.x, y = this.thread.y;
	var u = x / w, v = y / h;

	const pixel = inputTex[y][x];
	const r = pixel[0], g = pixel[1], b = pixel[2];

	this.color(r, g, b, 1);
	//return [r, g, b];
};

function image2Tex ( image ) {
	// runs slowly, so we only do it once and save the textures
	const pixel = image[this.thread.y][this.thread.x];
	return [pixel[0], pixel[1], pixel[2]];
}

export { shader, postShader };