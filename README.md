# Javascript Raytracer

This is an implementation of a raytracer written in Javascript using the GPU.js Library.  
Some helpful resources if you are doing something similar:  

https://raytracing.github.io/  
https://github.com/gpujs/gpu.js/  
https://www.youtube.com/watch?v=Qz0KTGYJtUk 

Some of the features of this project include:  
  
- Progressive rendering
- A camera with a variety of its own features
- Support for Metallic, Glossy, Diffuse, Textured and Emissive materials
- Support for sphere and triangle geometry
- 4 enviroment types and 4 different scenes
- Specialized viewing of surface normals and depth maps
- Support for a single texture and normal map combination
- Sphere UV texture mapping implementation
- GPU Acceleration, through GPU.js

This project can use further development, and there are a few features which I would have liked to add:

- Transparency, refraction and caustics
- Volumes such as smoke and fog
- A better system for handling textures
- Geometry optimization for higher detail scenes
