/*
 * 
 *                  xxxxxxx      xxxxxxx
 *                   x:::::x    x:::::x 
 *                    x:::::x  x:::::x  
 *                     x:::::xx:::::x   
 *                      x::::::::::x    
 *                       x::::::::x     
 *                       x::::::::x     
 *                      x::::::::::x    
 *                     x:::::xx:::::x   
 *                    x:::::x  x:::::x  
 *                   x:::::x    x:::::x 
 *              THE xxxxxxx      xxxxxxx TOOLKIT
 *                    
 *                  http://www.goXTK.com
 *                   
 * Copyright (c) 2012 The X Toolkit Developers <dev@goXTK.com>
 *                   
 *    The X Toolkit (XTK) is licensed under the MIT License:
 *      http://www.opensource.org/licenses/mit-license.php
 * 
 *      "Free software" is a matter of liberty, not price.
 *      "Free" as in "free speech", not as in "free beer".
 *                                         - Richard M. Stallman
 * 
 * 
 */

// provides
goog.provide('X.parserVTK');

// requires
goog.require('X.event');
goog.require('X.object');
goog.require('X.parser');
goog.require('X.triplets');



/**
 * Create a parser for the ascii .VTK format.
 * 
 * @constructor
 * @extends X.parser
 */
X.parserVTK = function() {

  //
  // call the standard constructor of X.base
  goog.base(this);
  
  //
  // class attributes
  
  /**
   * @inheritDoc
   * @const
   */
  this._classname = 'parserVTK';
  
};
// inherit from X.parser
goog.inherits(X.parserVTK, X.parser);


/**
 * @inheritDoc
 */
X.parserVTK.prototype.parse = function(container, object, data, flag) {

  X.TIMER(this._classname + '.parse');
  
  var p = object._points;
  var n = object._normals;
  var s = object._scalars;
  
  var _data = new Uint8Array(data);
  
  var _str = '';
  
  // allocate memory using a good guess
  object._points = p = new X.triplets(data.byteLength);
  object._normals = n = new X.triplets(data.byteLength);
  //object._colors = c = new X.triplets(data.byteLength);
  object._scalars = s = new X.scalars();
  
  // convert the char array to a string
  // the quantum is necessary to deal with large data
  var QUANTUM = 32768;
  for ( var i = 0, len = _data.length; i < len; i += QUANTUM) {
    
    _str += this.parseChars(_data, i, Math.min(i + QUANTUM, len));
    
  }
  
  var dataAsArray = _str.split('\n');
  var numberOfLines = dataAsArray.length;
  
  // in .VTK files, the points are not ordered for rendering, so we need to
  // buffer everything in X.triplets containers and then order it
  // nevertheless, we don't create the containers here since we can
  // figure out the exact size later. this is faster.
  this._unorderedPoints = null;
  this._unorderedNormals = null;
  this._unorderedPointScalars = null;
  // store names of point scalars that are not normals
  this._pointScalarsNames = new Array();
  
  // .. we also need a buffer for all indices
  this._geometries = [];
  
  // even if vtk files support multiple object types in the same file, we only
  // support one kind
  this._objectType = X.displayable.types.TRIANGLES;
  
  // this mode indicates that the next lines will be X,Y,Z coordinates
  this._pointsMode = false;
  
  // this mode indicates that the next lines will be indices mapping to points
  // and pointData
  this._geometryMode = false;
  
  // this mode indicates that the next lines will be pointData
  this._pointDataMode = false;
  // one type of pointData are normals and right now the only supported ones
  this._normalsMode = false;

  // support for scalar point data
  this._pointScalarsMode = false; 

  // this counter keeps track of how many scalars are in the vtk file
  // starts at negative 1 so first increment is 0
  this._pointScalarsIdx = -1;
  

  //
  // LOOP THROUGH ALL LINES
  //
  // This uses an optimized loop.
  //
  
  /*
   * Fast Duff's Device
   * 
   * @author Miller Medeiros <http://millermedeiros.com>
   * 
   * @version 0.3 (2010/08/25)
   */
  var i = 0;
  var n2 = numberOfLines % 8;
  while (n2--) {
    this.parseLine(dataAsArray[i]);
    i++;
  }
  
  n2 = (numberOfLines * 0.125) ^ 0;
  while (n2--) {
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
    this.parseLine(dataAsArray[i]);
    i++;
  }
  
  // now, configure the object according to the objectType
  this.configure(p, n, s);
  // check if any scalars exist and if not delete them completely from object
    if (s.array == null) {
	delete object._scalars
    }
  // .. and set the objectType
  object._type = this._objectType;
  
  X.TIMERSTOP(this._classname + '.parse');
  
  // the object should be set up here, so let's fire a modified event
  var modifiedEvent = new X.event.ModifiedEvent();
  modifiedEvent._object = object;
  modifiedEvent._container = container;
  this.dispatchEvent(modifiedEvent);
  
};


/**
 * Parses a line of .VTK data and modifies the given X.triplets containers.
 * 
 * @param {!string} line The line to parse.
 * @protected
 */
X.parserVTK.prototype.parseLine = function(line) {

  // trim the line
  line = line.replace(/^\s+|\s+$/g, '');
  
  // split to array
  var lineFields = line.split(' ');
  
  // number of lineFields
  var numberOfLineFields = lineFields.length;
  
  // the first field of the line can be a keyword to indicate different modes
  var firstLineField = lineFields[0];
  
  // KEYWORD CHECK / MODE SWITCH
  //
  // identify the section of the next coming lines using the vtk keywords
  switch (firstLineField) {
  
  case 'POINTS':

    // this means that real X,Y,Z points are coming
    
    this._pointsMode = true;
    this._geometryMode = false;
    this._pointDataMode = false;
    
    var numberOfPoints = parseInt(lineFields[1], 10);
    this._unorderedPoints = new X.triplets(numberOfPoints * 3);
    this._unorderedNormals = new X.triplets(numberOfPoints * 3);
    //this._unorderedPointScalars = new X.triplets(numberOfPoints * 3);
      this._unorderedPointScalars = new Array();
    
    
    // go to next line
    return;
    
  case 'VERTICES':

    // this means that triangles or points are coming
    
    this._geometryMode = true;
    this._pointsMode = false;
    this._pointDataMode = false;
    
    var numberOfElements = parseInt(lineFields[1], 10);
    
    if (numberOfElements >= 3) {
      this._objectType = X.displayable.types.TRIANGLES;
    } else if (numberOfElements == 1) {
      this._objectType = X.displayable.types.POINTS;
    } else {
      
      throw new Error('This VTK file is not supported!');
      
    }
    
    // reset all former geometries since we only support 1 geometry type per
    // file (the last one specified)
    this._geometries = [];
    
    // go to next line
    return;
    
  case 'TRIANGLE_STRIPS':

    // this means that triangle_strips are coming
    
    this._geometryMode = true;
    this._pointsMode = false;
    this._pointDataMode = false;
    this._objectType = X.displayable.types.TRIANGLE_STRIPS;
    
    // reset all former geometries since we only support 1 geometry type per
    // file (the last one specified)
    this._geometries = [];
    
    // go to next line
    return;
    
  case 'LINES':

    // this means that lines are coming
    
    this._geometryMode = true;
    this._pointsMode = false;
    this._pointDataMode = false;
    this._objectType = X.displayable.types.LINES;
    
    // reset all former geometries since we only support 1 geometry type per
    // file (the last one specified)
    this._geometries = [];
    
    // go to next line
    return;
    
  case 'POLYGONS':

    // this means that polygons are coming
    // we only support polygons which are triangles right now
    
    this._geometryMode = true;
    this._pointsMode = false;
    this._pointDataMode = false;
    this._objectType = X.displayable.types.POLYGONS;
    
    // reset all former geometries since we only support 1 geometry type per
    // file (the last one specified)
    this._geometries = [];
    
    // go to next line
    return;
    
  case 'POINT_DATA':

    // this means point-data is coming
    // f.e. normals
    
    this._pointDataMode = true;
    this._pointsMode = false;
    this._geometryMode = false;
    // go to next line
    return;
    
  }
  
  // PARSING
  //
  // now we parse according to the current mode
  //
  if (this._pointsMode) {
    
    // in pointsMode, each line has X,Y,Z coordinates separated by space
    
    if (numberOfLineFields == 1 || isNaN(parseFloat(firstLineField))) {
      
      // this likely means end of pointsMode
      this._pointsMode = false;
      
      return;
      
    }
    
    // assume max. 9 coordinate values (== 3 points) in one row
    if (numberOfLineFields >= 3) {
      var x0 = parseFloat(lineFields[0]);
      var y0 = parseFloat(lineFields[1]);
      var z0 = parseFloat(lineFields[2]);
      
      this._unorderedPoints.add(x0, y0, z0);
    }
    
    if (numberOfLineFields >= 6) {
      var x1 = parseFloat(lineFields[3]);
      var y1 = parseFloat(lineFields[4]);
      var z1 = parseFloat(lineFields[5]);
      this._unorderedPoints.add(x1, y1, z1);
    }
    
    if (numberOfLineFields >= 9) {
      var x2 = parseFloat(lineFields[6]);
      var y2 = parseFloat(lineFields[7]);
      var z2 = parseFloat(lineFields[8]);
      
      this._unorderedPoints.add(x2, y2, z2);
    }
    
  } // end of pointsMode
  else if (this._geometryMode) {
    
    // in geometryMode, each line has indices which map to points and pointsData
    
    if (numberOfLineFields == 1 || isNaN(parseFloat(firstLineField))) {
      
      // this likely means end of geometryMode
      this._geometryMode = false;
      return;
      
    }
    
    // the first element is the number of coming indices
    // so we just slice the first element to get all indices
    var values = lineFields.slice(1);
    
    // append all index values to the main geometries array
    this._geometries.push(values);
    
  } // end of geometryMode
  else if (this._pointDataMode) {
    
    // at the moment, only normals are supported as point-data
    
    if (firstLineField == 'NORMALS') {
      
	this._normalsMode = true;
	this._pointScalarsMode = false;
      
      return;
      
    }

    // support for scalar point_data
    // no support for LOOKUP_TABLES
    if (firstLineField == 'SCALARS') {

	this._pointScalarsMode = true;
	this._normalsMode = false;
	this._pointScalarsNames.push(lineFields[1]); 
	this._pointScalarsIdx = this._pointScalarsIdx + 1;
	//this._unorderedPointScalars[this._pointScalarsIdx] = new Array(numberOfPoints);
	this._unorderedPointScalars[this._pointScalarsIdx] = [];
	//this._pointScalarsIdx = this._pointScalarsIdx + 1;
	return;
    }

      // disregard LOOKUP_TABLE
      if (firstLineField == 'LOOKUP_TABLE') {
	  return;
      }
    
      // scalars only have OneLneField
    //if (numberOfLineFields == 1 || isNaN(parseFloat(firstLineField))) {
      //if (firstLineField!='LOOKUP_TABLE' && isNaN(parseFloat(firstLineField))) {
      
      // this likely means end of pointDataMode
//	  this._pointDataMode = false;
//	  this._normalsMode = false;
//	  this._pointScalarsMode = false;
	  
      	  //console.log(firstLineField);
	  //console.log(lineFields);
//	  return;
      
//      }
    
    // the normals mode
    if (this._normalsMode) {
	// condition to exit normalsMode
	if (numberOfLineFields == 1 || isNaN(parseFloat(firstLineField))) {
	    this._normalsMode = false;
	    // potential bug here. not sure normals and scalars in one file are handled.
	    //this._pointDataMode = false;
	    return
	}


      // assume 9 coordinate values (== 3 points) in one row
      
      if (numberOfLineFields >= 3) {
        var x0 = parseFloat(lineFields[0]);
        var y0 = parseFloat(lineFields[1]);
        var z0 = parseFloat(lineFields[2]);
        this._unorderedNormals.add(x0, y0, z0);
      }
      if (numberOfLineFields >= 6) {
        var x1 = parseFloat(lineFields[3]);
        var y1 = parseFloat(lineFields[4]);
        var z1 = parseFloat(lineFields[5]);
        this._unorderedNormals.add(x1, y1, z1);
      }
      if (numberOfLineFields >= 9) {
        var x2 = parseFloat(lineFields[6]);
        var y2 = parseFloat(lineFields[7]);
        var z2 = parseFloat(lineFields[8]);
        this._unorderedNormals.add(x2, y2, z2);
      }
      
    } // end of normalsMode

    // the point scalars mode
    if (this._pointScalarsMode) {
	// condition to exit pointScalarsMode
	if (numberOfLineFields != 1 || isNaN(parseFloat(firstLineField))) {
	    this._pointsScalarsMode = false;
	    // potential bug here. not sure normals and scalars in one file are handled.
	    //this._pointDataMode = false;
	    return
	}
	// ignores the LOOKUP_TABLE line
	if (numberOfLineFields != 2) {
	    var scalar = parseFloat(lineFields[0]);
	    this._unorderedPointScalars[this._pointScalarsIdx].push(scalar);
	}
	
    } // end of pointScalarsMode

    
  } // end of pointDataMode
  
};


/**
 * Configure X.object points and normals. This method takes the object type into
 * consideration to f.e. use degenerated triangles for TRIANGLE_STRIPS.
 * 
 * @param {!X.triplets} p The points container of the X.object.
 * @param {!X.triplets} n The normals container of the X.object.
 */
X.parserVTK.prototype.configure = function(p, n, s) {

  var unorderedPoints = this._unorderedPoints;
  var unorderedNormals = this._unorderedNormals;
  var unorderedPointScalars = this._unorderedPointScalars;
  
  // cache often used values for fast access
  var numberOfUnorderedNormals = unorderedNormals.length;
  var numberOfUnorderedPointScalars;
    if (unorderedPointScalars.length == 0) 
	numberOfUnorderedPointScalars = 0;
    else
	numberOfUnorderedPointScalars = unorderedPointScalars[0].length;

    // initialize orderedPointScalars
    //var orderedPointScalars = new Float32Array(numberOfUnorderedPointScalars * 3);
    var orderedPointScalars = new Array();
    for (j=0;j<unorderedPointScalars.length;j++) {
	orderedPointScalars[j] = new Array();
    }
    


  var pointIdx = 0;
  var numberOfGeometries = this._geometries.length;
  var i = numberOfGeometries;
  // we use this loop here since it's slightly faster than the for loop
  do {
    
    // we want to loop through the geometries in the range 0..(N - 1)
    var currentGeometry = this._geometries[numberOfGeometries - i];
    var currentGeometryLength = currentGeometry.length;

    // in the sub-loop we loop through the indices of the current geometry
    var k;
    for (k = 0; k < currentGeometryLength; k++) {
      
	// boundary check for LINES
	if (this._objectType == X.displayable.types.LINES &&
            (k + 1 >= currentGeometryLength)) {
            
            // jump out since we reached the end of the geometry
            break;
            
	}
      
	// grab the current index
	var currentIndex = parseInt(currentGeometry[k], 10);
	
	// grab the point with the currentIndex
	var currentPoint = unorderedPoints.get(currentIndex);
	
	//
	// POINTS
	//
	
	// .. and add it
	p.add(currentPoint[0], currentPoint[1], currentPoint[2]);
	
	var nextIndex = currentIndex;
	var nextPoint = currentPoint;
	// special case for LINES: we add the next element twice to
	// interrupt the line segments (in webGL, lines mode connects always 2
	// points)
	// if we would not do this, then all line segments would be connected
	if (this._objectType == X.displayable.types.LINES) {
        
            nextIndex = parseInt(currentGeometry[k + 1], 10);
            // grab the next point
            nextPoint = unorderedPoints.get(nextIndex);
            
            // and add it
            p.add(nextPoint[0], nextPoint[1], nextPoint[2]);
            
	} // LINES
	
      // special case for TRIANGLE_STRIPS: we add the first and the
      // last element twice to interrupt the strips (as degenerated triangles)
      // if we would not do this, then all strips would be connected
      else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
        
        // check if this is the first or last element
        if (k == 0 || k == currentGeometryLength - 1) {
          
          // if this is the first or last point of the triangle strip, add it
          // again
          p.add(currentPoint[0], currentPoint[1], currentPoint[2]);
          
        }
        
      } // TRIANGLE_STRIPS
      


      //
      // NORMALS
      // 
      if (currentIndex < numberOfUnorderedNormals) {
        
        // grab the normal with the currentIndex, if it exists
        var currentNormals = unorderedNormals.get(currentIndex);
        
        // .. and add it
        n.add(currentNormals[0], currentNormals[1], currentNormals[2]);
        
        // for LINES, add the next normal (neighbor)
        if (this._objectType == X.displayable.types.LINES) {
          
          // the neighbor
          var nextNormals = unorderedNormals.get(nextIndex);
          
          // .. and add it
          n.add(nextNormals[0], nextNormals[1], nextNormals[2]);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // if this is the first or last point of the triangle strip, add it
            // again
            n.add(currentNormals[0], currentNormals[1], currentNormals[2]);
            
          }
          
        } // TRIANGLE_STRIPS
        

      } else {
        
        // add an artificial normal
        var artificialNormal = new goog.math.Vec3(currentPoint[0],
            currentPoint[1], currentPoint[2]);
        artificialNormal.normalize();
        n.add(artificialNormal.x, artificialNormal.y, artificialNormal.z);
        
        // for LINES, do it again
        if (this._objectType == X.displayable.types.LINES) {
          
          // grab the next normal (artificial)
          var artificialNormal2 = new goog.math.Vec3(nextPoint[0],
              nextPoint[1], nextPoint[2]);
          artificialNormal2.normalize();
          n.add(artificialNormal2.x, artificialNormal2.y, artificialNormal2.z);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // add the artificial normal again
            n.add(artificialNormal.x, artificialNormal.y, artificialNormal.z);
            
          }
          
        } // TRIANGLE_STRIPS
        
      }

      //
      // NORMALS
      // 
      if (currentIndex < numberOfUnorderedNormals) {
        
        // grab the normal with the currentIndex, if it exists
        var currentNormals = unorderedNormals.get(currentIndex);
        
        // .. and add it
        n.add(currentNormals[0], currentNormals[1], currentNormals[2]);
        
        // for LINES, add the next normal (neighbor)
        if (this._objectType == X.displayable.types.LINES) {
          
          // the neighbor
          var nextNormals = unorderedNormals.get(nextIndex);
          
          // .. and add it
          n.add(nextNormals[0], nextNormals[1], nextNormals[2]);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // if this is the first or last point of the triangle strip, add it
            // again
            n.add(currentNormals[0], currentNormals[1], currentNormals[2]);
            
          }
          
        } // TRIANGLE_STRIPS
        

      } else {
        
        // add an artificial normal
        var artificialNormal = new goog.math.Vec3(currentPoint[0],
            currentPoint[1], currentPoint[2]);
        artificialNormal.normalize();
        n.add(artificialNormal.x, artificialNormal.y, artificialNormal.z);
        
        // for LINES, do it again
        if (this._objectType == X.displayable.types.LINES) {
          
          // grab the next normal (artificial)
          var artificialNormal2 = new goog.math.Vec3(nextPoint[0],
              nextPoint[1], nextPoint[2]);
          artificialNormal2.normalize();
          n.add(artificialNormal2.x, artificialNormal2.y, artificialNormal2.z);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // add the artificial normal again
            n.add(artificialNormal.x, artificialNormal.y, artificialNormal.z);
            
          }
          
        } // TRIANGLE_STRIPS
        
      }

      //
      // NORMALS
      // 
      if (currentIndex < numberOfUnorderedNormals) {
        
        // grab the normal with the currentIndex, if it exists
        var currentNormals = unorderedNormals.get(currentIndex);
        
        // .. and add it
        n.add(currentNormals[0], currentNormals[1], currentNormals[2]);
        
        // for LINES, add the next normal (neighbor)
        if (this._objectType == X.displayable.types.LINES) {
          
          // the neighbor
          var nextNormals = unorderedNormals.get(nextIndex);
          
          // .. and add it
          n.add(nextNormals[0], nextNormals[1], nextNormals[2]);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // if this is the first or last point of the triangle strip, add it
            // again
            n.add(currentNormals[0], currentNormals[1], currentNormals[2]);
            
          }
          
        } // TRIANGLE_STRIPS
        

      } else {
        
        // add an artificial normal
        var artificialNormal = new goog.math.Vec3(currentPoint[0],
            currentPoint[1], currentPoint[2]);
        artificialNormal.normalize();
        n.add(artificialNormal.x, artificialNormal.y, artificialNormal.z);
        
        // for LINES, do it again
        if (this._objectType == X.displayable.types.LINES) {
          
          // grab the next normal (artificial)
          var artificialNormal2 = new goog.math.Vec3(nextPoint[0],
              nextPoint[1], nextPoint[2]);
          artificialNormal2.normalize();
          n.add(artificialNormal2.x, artificialNormal2.y, artificialNormal2.z);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // add the artificial normal again
            n.add(artificialNormal.x, artificialNormal.y, artificialNormal.z);
            
          }
          
        } // TRIANGLE_STRIPS
        
      }

      //
      // POINT SCALARS
      // 
      if (currentIndex < numberOfUnorderedPointScalars) {
        
        // grab the point scalar with the currentIndex, if it exists
	  for (j=0;j<unorderedPointScalars.length;j++) {
              var currentPointScalar = unorderedPointScalars[j][currentIndex];
	      //orderedPointScalars[3*pointIdx + 0] = currentPointScalar;
	      //orderedPointScalars[3*pointIdx + 1] = currentPointScalar;
	      //xorderedPointScalars[3*pointIdx + 2] = currentPointScalar;
	      orderedPointScalars[j].push(currentPointScalar);
	      orderedPointScalars[j].push(currentPointScalar);
	      orderedPointScalars[j].push(currentPointScalar);
	      pointIdx++;
	  }
        // .. and add it
	// use temporary color for now. somehow we have to scale these.
	  var red = 0.9;
	  var green = 0.4;
	  var blue = 0.0;
	  
        //c.add(red, green, blue);
        
        // for LINES, add the next normal (neighbor)
        if (this._objectType == X.displayable.types.LINES) {
          
          // the neighbor
          var nextPointScalar = unorderedPointScalars[nextIndex];
          
          // .. and add it
          //c.add(red, green, blue);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // if this is the first or last point of the triangle strip, add it
            // again
            //c.add(red, green, blue);
            
          }
          
        } // TRIANGLE_STRIPS
        

      } else {
        
        // add an artificial scalar
        //var artificialPointScalar = new goog.math.Vec3(currentPoint[0],
        //    currentPoint[1], currentPoint[2]);
        //artificialNormal.normalize();
        //c.add(0.0, 0.0, 0.0);
        
        // for LINES, do it again
        if (this._objectType == X.displayable.types.LINES) {
          
          // grab the next normal (artificial)
          //var artificialNormal2 = new goog.math.Vec3(nextPoint[0],
          //    nextPoint[1], nextPoint[2]);
          //artificialNormal2.normalize();
          //c.add(0.0, 0.0, 0.0);
          
        } // LINES
        
        // for TRIANGLE_STRIPS, special case
        else if (this._objectType == X.displayable.types.TRIANGLE_STRIPS) {
          
          // check if this is the first or last element
          if (k == 0 || k == currentGeometryLength - 1) {
            
            // add the artificial normal again
            //c.add(0.0,0.0,0.0);
            
          }
          
        } // TRIANGLE_STRIPS
        
      }
      
    } // for loop through the currentGeometry
    
    i--;
    
  } while (i > 0);

    // Assign Scalars to object as well as minimum/maximums and thresholds

    // Turns out the thresholding is totally broken. You have to normalize all of the data to be between 0 and 1. Otherwise it breaks and doesn't look good. I could go in and try to fix the threholding but I'm not going to for now. This will prevent challenges when trying to render all of the data

    // compute max and min values on unorderedPointScalars
    var maxPointScalars = new Array(unorderedPointScalars.length);
    var minPointScalars = new Array(unorderedPointScalars.length);
    var shiftedPointScalars = new Array(unorderedPointScalars.length);

    for (i=0; i< unorderedPointScalars.length; i++) {
	// get max and min of array
	maxPointScalars[i] = Math.max.apply(null, unorderedPointScalars[i]);
	minPointScalars[i] = Math.min.apply(null, unorderedPointScalars[i]);
	
	// shift scalar data so its non-negative
	// i don't use this actually
	shiftedPointScalars[i] = new Array(unorderedPointScalars[i].length);
	for (j=0; j<unorderedPointScalars[i].length; j++) {
	    shiftedPointScalars[i][j] = unorderedPointScalars[i][j] - minPointScalars[i];
	}
    }
    
    
    // attach min, max values and the whole shebang! (adopted from parserCRV.js)
    //s._min = 0.0;
    //s._max = 1.0;
    s._min = minPointScalars;
    s._max = maxPointScalars;
    // .. and set the default threshold
    // only if the threshold was not already set
    if (s._lowerThreshold == -Infinity) {
	//s._lowerThreshold = minPointScalars[0];
	//s._lowerThreshold = minPointScalars[1];
	s._lowerThreshold = 0.0;
    }
    if (s._upperThreshold == Infinity) {
	//s._upperThreshold = maxPointScalars[0];
	//s._upperThreshold = maxPointScalars[1];
	s._upperThreshold = 1.0;
    }

    // set scalar object values if scalars exist
    if (orderedPointScalars.length > 0) {
	// by default use the first read scalar values as default
	j = 0;  
	var orderedPointScalarsFloat32 = new Float32Array(orderedPointScalars[j].length);
	
	for (k=0;k<orderedPointScalars[j].length;k++) {
	    
	    // shift orderedPointScalars so min is 0 and normalize so that values are between 0 and 1
	    orderedPointScalarsFloat32[k] = (orderedPointScalars[j][k] - minPointScalars[j]) / (maxPointScalars[j] - minPointScalars[j]);
	}
	
	
	//s._array = unorderedPointScalars[0]; // the un-ordered scalars
	//s._array = orderedPointScalarsFloat32;
	s._array = orderedPointScalars;
	s._glArray = orderedPointScalarsFloat32; // the ordered, gl-Ready
	s._minColor = [0.0, 0.0, 1.0];
	s._maxColor = [1.0, 0.0, 0.0];
	s._arrayNames = this._pointScalarsNames;
	// now mark the scalars dirty
	s._dirty = true;
    }

};



// export symbols (required for advanced compilation)
goog.exportSymbol('X.parserVTK', X.parserVTK);
goog.exportSymbol('X.parserVTK.prototype.parse', X.parserVTK.prototype.parse);
