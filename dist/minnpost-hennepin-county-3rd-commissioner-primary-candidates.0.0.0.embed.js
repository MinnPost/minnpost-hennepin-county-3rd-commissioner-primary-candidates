
// Hack around existing jQuery
if (typeof window.jQuery != 'undefined') {
  window._jQuery = window.jQuery;
  window._$ = window.$;
}/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("almond", function(){});

/*!
 * jQuery JavaScript Library v1.11.0
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-01-23T21:02Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper window is present,
		// execute the factory and get jQuery
		// For environments that do not inherently posses a window with a document
		// (such as Node.js), expose a jQuery-making factory as module.exports
		// This accentuates the need for the creation of a real window
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//

var deletedIds = [];

var slice = deletedIds.slice;

var concat = deletedIds.concat;

var push = deletedIds.push;

var indexOf = deletedIds.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var trim = "".trim;

var support = {};



var
	version = "1.11.0",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return a 'clean' array
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return just the object
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: deletedIds.sort,
	splice: deletedIds.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var src, copyIsArray, copy, name, options, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		/* jshint eqeqeq: false */
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		return obj - parseFloat( obj ) >= 0;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	isPlainObject: function( obj ) {
		var key;

		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!hasOwn.call(obj, "constructor") &&
				!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Support: IE<9
		// Handle iteration over inherited properties before own properties.
		if ( support.ownLast ) {
			for ( key in obj ) {
				return hasOwn.call( obj, key );
			}
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.
		for ( key in obj ) {}

		return key === undefined || hasOwn.call( obj, key );
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && jQuery.trim( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Use native String.trim function wherever possible
	trim: trim && !trim.call("\uFEFF\xA0") ?
		function( text ) {
			return text == null ?
				"" :
				trim.call( text );
		} :

		// Otherwise use our own trimming functionality
		function( text ) {
			return text == null ?
				"" :
				( text + "" ).replace( rtrim, "" );
		},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( indexOf ) {
				return indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		while ( j < len ) {
			first[ i++ ] = second[ j++ ];
		}

		// Support: IE<9
		// Workaround casting of .length to NaN on otherwise arraylike objects (e.g., NodeLists)
		if ( len !== len ) {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var args, proxy, tmp;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: function() {
		return +( new Date() );
	},

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v1.10.16
 * http://sizzlejs.com/
 *
 * Copyright 2013 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-01-13
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	compile,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:([*^$|!~]?=)" + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments quoted,
	//   then not containing pseudos/brackets,
	//   then attribute selectors/non-parenthetical expressions,
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + attributes.replace( 3, 8 ) + ")*)|.*)\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( documentIsHTML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName && context.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== strundefined && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare,
		doc = node ? node.ownerDocument || node : preferredDoc,
		parent = doc.defaultView;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsHTML = !isXML( doc );

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", function() {
				setDocument();
			}, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", function() {
				setDocument();
			});
		}
	}

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if getElementsByClassName can be trusted
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName ) && assert(function( div ) {
		div.innerHTML = "<div class='a'></div><div class='a i'></div>";

		// Support: Safari<4
		// Catch class over-caching
		div.firstChild.className = "i";
		// Support: Opera<10
		// Catch gEBCN failure to find non-leading classes
		return div.getElementsByClassName("i").length === 2;
	});

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [m] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select t=''><option selected=''></option></select>";

			// Support: IE8, Opera 10-12
			// Nothing should be selected when empty strings follow ^= or $= or *=
			if ( div.querySelectorAll("[t^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [elem] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[5] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] && match[4] !== undefined ) {
				match[2] = match[4];

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== strundefined && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		match = tokenize( selector );

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					support.getById && context.nodeType === 9 && documentIsHTML &&
					Expr.relative[ tokens[1].type ] ) {

				context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
				if ( !context ) {
					return results;
				}
				selector = selector.slice( tokens.shift().value.length );
			}

			// Fetch a seed set for right-to-left matching
			i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
			while ( i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( runescape, funescape ),
						rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && toSelector( tokens );
						if ( !selector ) {
							push.apply( results, seed );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
}

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome<14
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			ret = [],
			self = this,
			len = self.length;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				ret = jQuery.unique( ret );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				ret = ret.reverse();
			}
		}

		return this.pushStack( ret );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,
		// Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );

					} else if ( !(--remaining) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	}
});

/**
 * Clean-up method for dom ready events
 */
function detach() {
	if ( document.addEventListener ) {
		document.removeEventListener( "DOMContentLoaded", completed, false );
		window.removeEventListener( "load", completed, false );

	} else {
		document.detachEvent( "onreadystatechange", completed );
		window.detachEvent( "onload", completed );
	}
}

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	// readyState === "complete" is good enough for us to call the dom ready in oldIE
	if ( document.addEventListener || event.type === "load" || document.readyState === "complete" ) {
		detach();
		jQuery.ready();
	}
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", completed );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", completed );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// detach all dom ready events
						detach();

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};


var strundefined = typeof undefined;



// Support: IE<9
// Iteration over object's inherited properties before its own
var i;
for ( i in jQuery( support ) ) {
	break;
}
support.ownLast = i !== "0";

// Note: most support tests are defined in their respective modules.
// false until the test is run
support.inlineBlockNeedsLayout = false;

jQuery(function() {
	// We need to execute this one support test ASAP because we need to know
	// if body.style.zoom needs to be set.

	var container, div,
		body = document.getElementsByTagName("body")[0];

	if ( !body ) {
		// Return for frameset docs that don't have a body
		return;
	}

	// Setup
	container = document.createElement( "div" );
	container.style.cssText = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px";

	div = document.createElement( "div" );
	body.appendChild( container ).appendChild( div );

	if ( typeof div.style.zoom !== strundefined ) {
		// Support: IE<8
		// Check if natively block-level elements act like inline-block
		// elements when setting their display to 'inline' and giving
		// them layout
		div.style.cssText = "border:0;margin:0;width:1px;padding:1px;display:inline;zoom:1";

		if ( (support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 )) ) {
			// Prevent IE 6 from affecting layout for positioned elements #11048
			// Prevent IE from shrinking the body in IE 7 mode #12869
			// Support: IE<8
			body.style.zoom = 1;
		}
	}

	body.removeChild( container );

	// Null elements to avoid leaks in IE
	container = div = null;
});




(function() {
	var div = document.createElement( "div" );

	// Execute the test only if not already executed in another module.
	if (support.deleteExpando == null) {
		// Support: IE<9
		support.deleteExpando = true;
		try {
			delete div.test;
		} catch( e ) {
			support.deleteExpando = false;
		}
	}

	// Null elements to avoid leaks in IE.
	div = null;
})();


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( elem ) {
	var noData = jQuery.noData[ (elem.nodeName + " ").toLowerCase() ],
		nodeType = +elem.nodeType || 1;

	// Do not set data on non-element DOM nodes because it will not be cleared (#8335).
	return nodeType !== 1 && nodeType !== 9 ?
		false :

		// Nodes accept data unless otherwise specified; rejection can be conditional
		!noData || noData !== true && elem.getAttribute("classid") === noData;
};


var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}

function internalData( elem, name, data, pvt /* Internal Use Only */ ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var ret, thisCache,
		internalKey = jQuery.expando,

		// We have to handle DOM nodes and JS objects differently because IE6-7
		// can't GC object references properly across the DOM-JS boundary
		isNode = elem.nodeType,

		// Only DOM nodes need the global jQuery cache; JS object data is
		// attached directly to the object so GC can occur automatically
		cache = isNode ? jQuery.cache : elem,

		// Only defining an ID for JS objects if its cache already exists allows
		// the code to shortcut on the same path as a DOM node with no cache
		id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

	// Avoid doing any more work than we need to when trying to get data on an
	// object that has no data at all
	if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && data === undefined && typeof name === "string" ) {
		return;
	}

	if ( !id ) {
		// Only DOM nodes need a new unique ID for each element since their data
		// ends up in the global cache
		if ( isNode ) {
			id = elem[ internalKey ] = deletedIds.pop() || jQuery.guid++;
		} else {
			id = internalKey;
		}
	}

	if ( !cache[ id ] ) {
		// Avoid exposing jQuery metadata on plain JS objects when the object
		// is serialized using JSON.stringify
		cache[ id ] = isNode ? {} : { toJSON: jQuery.noop };
	}

	// An object can be passed to jQuery.data instead of a key/value pair; this gets
	// shallow copied over onto the existing cache
	if ( typeof name === "object" || typeof name === "function" ) {
		if ( pvt ) {
			cache[ id ] = jQuery.extend( cache[ id ], name );
		} else {
			cache[ id ].data = jQuery.extend( cache[ id ].data, name );
		}
	}

	thisCache = cache[ id ];

	// jQuery data() is stored in a separate object inside the object's internal data
	// cache in order to avoid key collisions between internal data and user-defined
	// data.
	if ( !pvt ) {
		if ( !thisCache.data ) {
			thisCache.data = {};
		}

		thisCache = thisCache.data;
	}

	if ( data !== undefined ) {
		thisCache[ jQuery.camelCase( name ) ] = data;
	}

	// Check for both converted-to-camel and non-converted data property names
	// If a data property was specified
	if ( typeof name === "string" ) {

		// First Try to find as-is property data
		ret = thisCache[ name ];

		// Test for null|undefined property data
		if ( ret == null ) {

			// Try to find the camelCased property
			ret = thisCache[ jQuery.camelCase( name ) ];
		}
	} else {
		ret = thisCache;
	}

	return ret;
}

function internalRemoveData( elem, name, pvt ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var thisCache, i,
		isNode = elem.nodeType,

		// See jQuery.data for more information
		cache = isNode ? jQuery.cache : elem,
		id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

	// If there is already no cache entry for this object, there is no
	// purpose in continuing
	if ( !cache[ id ] ) {
		return;
	}

	if ( name ) {

		thisCache = pvt ? cache[ id ] : cache[ id ].data;

		if ( thisCache ) {

			// Support array or space separated string names for data keys
			if ( !jQuery.isArray( name ) ) {

				// try the string as a key before any manipulation
				if ( name in thisCache ) {
					name = [ name ];
				} else {

					// split the camel cased version by spaces unless a key with the spaces exists
					name = jQuery.camelCase( name );
					if ( name in thisCache ) {
						name = [ name ];
					} else {
						name = name.split(" ");
					}
				}
			} else {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = name.concat( jQuery.map( name, jQuery.camelCase ) );
			}

			i = name.length;
			while ( i-- ) {
				delete thisCache[ name[i] ];
			}

			// If there is no data left in the cache, we want to continue
			// and let the cache object itself get destroyed
			if ( pvt ? !isEmptyDataObject(thisCache) : !jQuery.isEmptyObject(thisCache) ) {
				return;
			}
		}
	}

	// See jQuery.data for more information
	if ( !pvt ) {
		delete cache[ id ].data;

		// Don't destroy the parent cache unless the internal data object
		// had been the only thing left in it
		if ( !isEmptyDataObject( cache[ id ] ) ) {
			return;
		}
	}

	// Destroy the cache
	if ( isNode ) {
		jQuery.cleanData( [ elem ], true );

	// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
	/* jshint eqeqeq: false */
	} else if ( support.deleteExpando || cache != cache.window ) {
		/* jshint eqeqeq: true */
		delete cache[ id ];

	// When all else fails, null
	} else {
		cache[ id ] = null;
	}
}

jQuery.extend({
	cache: {},

	// The following elements (space-suffixed to avoid Object.prototype collisions)
	// throw uncatchable exceptions if you attempt to set expando properties
	noData: {
		"applet ": true,
		"embed ": true,
		// ...but Flash objects (which have this classid) *can* handle expandos
		"object ": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data ) {
		return internalData( elem, name, data );
	},

	removeData: function( elem, name ) {
		return internalRemoveData( elem, name );
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return internalData( elem, name, data, true );
	},

	_removeData: function( elem, name ) {
		return internalRemoveData( elem, name, true );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[0],
			attrs = elem && elem.attributes;

		// Special expections of .data basically thwart jQuery.access,
		// so implement the relevant behavior ourselves

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {
						name = attrs[i].name;

						if ( name.indexOf("data-") === 0 ) {
							name = jQuery.camelCase( name.slice(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		return arguments.length > 1 ?

			// Sets one value
			this.each(function() {
				jQuery.data( this, key, value );
			}) :

			// Gets one value
			// Try to fetch any internally stored data first
			elem ? dataAttr( elem, key, jQuery.data( elem, key ) ) : undefined;
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery._removeData( elem, type + "queue" );
				jQuery._removeData( elem, key );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};



// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		length = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < length; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			length ? fn( elems[0], key ) : emptyGet;
};
var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	var fragment = document.createDocumentFragment(),
		div = document.createElement("div"),
		input = document.createElement("input");

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a>";

	// IE strips leading whitespace when .innerHTML is used
	support.leadingWhitespace = div.firstChild.nodeType === 3;

	// Make sure that tbody elements aren't automatically inserted
	// IE will insert them into empty tables
	support.tbody = !div.getElementsByTagName( "tbody" ).length;

	// Make sure that link elements get serialized correctly by innerHTML
	// This requires a wrapper element in IE
	support.htmlSerialize = !!div.getElementsByTagName( "link" ).length;

	// Makes sure cloning an html5 element does not cause problems
	// Where outerHTML is undefined, this still works
	support.html5Clone =
		document.createElement( "nav" ).cloneNode( true ).outerHTML !== "<:nav></:nav>";

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	input.type = "checkbox";
	input.checked = true;
	fragment.appendChild( input );
	support.appendChecked = input.checked;

	// Make sure textarea (and checkbox) defaultValue is properly cloned
	// Support: IE6-IE11+
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

	// #11217 - WebKit loses check when the name is after the checked attribute
	fragment.appendChild( div );
	div.innerHTML = "<input type='radio' checked='checked' name='t'/>";

	// Support: Safari 5.1, iOS 5.1, Android 4.x, Android 2.3
	// old WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<9
	// Opera does not clone events (and typeof div.attachEvent === undefined).
	// IE9-10 clones events bound via attachEvent, but they don't trigger with .click()
	support.noCloneEvent = true;
	if ( div.attachEvent ) {
		div.attachEvent( "onclick", function() {
			support.noCloneEvent = false;
		});

		div.cloneNode( true ).click();
	}

	// Execute the test only if not already executed in another module.
	if (support.deleteExpando == null) {
		// Support: IE<9
		support.deleteExpando = true;
		try {
			delete div.test;
		} catch( e ) {
			support.deleteExpando = false;
		}
	}

	// Null elements to avoid leaks in IE.
	fragment = div = input = null;
})();


(function() {
	var i, eventName,
		div = document.createElement( "div" );

	// Support: IE<9 (lack submit/change bubble), Firefox 23+ (lack focusin event)
	for ( i in { submit: true, change: true, focusin: true }) {
		eventName = "on" + i;

		if ( !(support[ i + "Bubbles" ] = eventName in window) ) {
			// Beware of CSP restrictions (https://developer.mozilla.org/en/Security/CSP)
			div.setAttribute( eventName, "t" );
			support[ i + "Bubbles" ] = div.attributes[ eventName ].expando === false;
		}
	}

	// Null elements to avoid leaks in IE.
	div = null;
})();


var rformElems = /^(?:input|select|textarea)$/i,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {
		var tmp, events, t, handleObjIn,
			special, eventHandle, handleObj,
			handlers, type, namespaces, origType,
			elemData = jQuery._data( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {
		var j, handleObj, tmp,
			origCount, t, events,
			special, handlers, type,
			namespaces, origType,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery._removeData( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		var handle, ontype, cur,
			bubbleType, special, tmp, i,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && elem[ type ] && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					try {
						elem[ type ]();
					} catch ( e ) {
						// IE<9 dies on focus/blur to hidden element (#1486,#12518)
						// only reproducible on winXP IE8 native, not IE9 in IE8 mode
					}
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, ret, handleObj, matched, j,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( jQuery._data( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var sel, handleObj, matches, i,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			/* jshint eqeqeq: false */
			for ( ; cur != this; cur = cur.parentNode || this ) {
				/* jshint eqeqeq: true */

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && (cur.disabled !== true || event.type !== "click") ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: IE<9
		// Fix target property (#1925)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Support: Chrome 23+, Safari?
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// Support: IE<9
		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328)
		event.metaKey = !!event.metaKey;

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var body, eventDoc, doc,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					try {
						this.focus();
						return false;
					} catch ( e ) {
						// Support: IE<9
						// If we error on focus to hidden element (#1486, #12518),
						// let .trigger() run the handlers
					}
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( jQuery.nodeName( this, "input" ) && this.type === "checkbox" && this.click ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Even when returnValue equals to undefined Firefox will still show alert
				if ( event.result !== undefined ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === strundefined ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined && (
				// Support: IE < 9
				src.returnValue === false ||
				// Support: Android < 4.0
				src.getPreventDefault && src.getPreventDefault() ) ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;
		if ( !e ) {
			return;
		}

		// If preventDefault exists, run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// Support: IE
		// Otherwise set the returnValue property of the original event to false
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;
		if ( !e ) {
			return;
		}
		// If stopPropagation exists, run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}

		// Support: IE
		// Set the cancelBubble property of the original event to true
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "submitBubbles" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "submitBubbles", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "changeBubbles" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "changeBubbles", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = jQuery._data( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				jQuery._data( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = jQuery._data( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					jQuery._removeData( doc, fix );
				} else {
					jQuery._data( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var type, origFn;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
		safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		area: [ 1, "<map>", "</map>" ],
		param: [ 1, "<object>", "</object>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
		// unless wrapped in a div with non-breaking characters in front of it.
		_default: support.htmlSerialize ? [ 0, "", "" ] : [ 1, "X<div>", "</div>"  ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

function getAll( context, tag ) {
	var elems, elem,
		i = 0,
		found = typeof context.getElementsByTagName !== strundefined ? context.getElementsByTagName( tag || "*" ) :
			typeof context.querySelectorAll !== strundefined ? context.querySelectorAll( tag || "*" ) :
			undefined;

	if ( !found ) {
		for ( found = [], elems = context.childNodes || context; (elem = elems[i]) != null; i++ ) {
			if ( !tag || jQuery.nodeName( elem, tag ) ) {
				found.push( elem );
			} else {
				jQuery.merge( found, getAll( elem, tag ) );
			}
		}
	}

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], found ) :
		found;
}

// Used in buildFragment, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

// Support: IE<8
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (jQuery.find.attr( elem, "type" ) !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );
	if ( match ) {
		elem.type = match[1];
	} else {
		elem.removeAttribute("type");
	}
	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var elem,
		i = 0;
	for ( ; (elem = elems[i]) != null; i++ ) {
		jQuery._data( elem, "globalEval", !refElements || jQuery._data( refElements[i], "globalEval" ) );
	}
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function fixCloneNodeIssues( src, dest ) {
	var nodeName, e, data;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	nodeName = dest.nodeName.toLowerCase();

	// IE6-8 copies events bound via attachEvent when using cloneNode.
	if ( !support.noCloneEvent && dest[ jQuery.expando ] ) {
		data = jQuery._data( dest );

		for ( e in data.events ) {
			jQuery.removeEvent( dest, e, data.handle );
		}

		// Event data gets referenced instead of copied if the expando gets copied too
		dest.removeAttribute( jQuery.expando );
	}

	// IE blanks contents when cloning scripts, and tries to evaluate newly-set text
	if ( nodeName === "script" && dest.text !== src.text ) {
		disableScript( dest ).text = src.text;
		restoreScript( dest );

	// IE6-10 improperly clones children of object elements using classid.
	// IE10 throws NoModificationAllowedError if parent is null, #12132.
	} else if ( nodeName === "object" ) {
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( support.html5Clone && ( src.innerHTML && !jQuery.trim(dest.innerHTML) ) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.defaultSelected = dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var destElements, node, clone, i, srcElements,
			inPage = jQuery.contains( elem.ownerDocument, elem );

		if ( support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!support.noCloneEvent || !support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			// Fix all IE cloning issues
			for ( i = 0; (node = srcElements[i]) != null; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					fixCloneNodeIssues( node, destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0; (node = srcElements[i]) != null; i++ ) {
					cloneCopyEvent( node, destElements[i] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		destElements = srcElements = node = null;

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var j, elem, contains,
			tmp, tag, tbody, wrap,
			l = elems.length,

			// Ensure a safe fragment
			safe = createSafeFragment( context ),

			nodes = [],
			i = 0;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || safe.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = (rtagName.exec( elem ) || [ "", "" ])[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;

					tmp.innerHTML = wrap[1] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[2];

					// Descend through wrappers to the right content
					j = wrap[0];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Manually add leading whitespace removed by IE
					if ( !support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						nodes.push( context.createTextNode( rleadingWhitespace.exec( elem )[0] ) );
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						elem = tag === "table" && !rtbody.test( elem ) ?
							tmp.firstChild :

							// String was a bare <thead> or <tfoot>
							wrap[1] === "<table>" && !rtbody.test( elem ) ?
								tmp :
								0;

						j = elem && elem.childNodes.length;
						while ( j-- ) {
							if ( jQuery.nodeName( (tbody = elem.childNodes[j]), "tbody" ) && !tbody.childNodes.length ) {
								elem.removeChild( tbody );
							}
						}
					}

					jQuery.merge( nodes, tmp.childNodes );

					// Fix #12392 for WebKit and IE > 9
					tmp.textContent = "";

					// Fix #12392 for oldIE
					while ( tmp.firstChild ) {
						tmp.removeChild( tmp.firstChild );
					}

					// Remember the top-level container for proper cleanup
					tmp = safe.lastChild;
				}
			}
		}

		// Fix #11356: Clear elements from fragment
		if ( tmp ) {
			safe.removeChild( tmp );
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !support.appendChecked ) {
			jQuery.grep( getAll( nodes, "input" ), fixDefaultChecked );
		}

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( safe.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		tmp = null;

		return safe;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var elem, type, id, data,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( typeof elem.removeAttribute !== strundefined ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						deletedIds.push( id );
					}
				}
			}
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem, false ) );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}

			// If this is a select, ensure that it displays empty (#12336)
			// Support: IE<9
			if ( elem.options && jQuery.nodeName( elem, "select" ) ) {
				elem.options.length = 0;
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ (rtagName.exec( value ) || [ "", "" ])[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var first, node, hasScripts,
			scripts, doc, fragment,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[0],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[0] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[i], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!jQuery._data( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( ( node.text || node.textContent || node.innerHTML || "" ).replace( rcleanScript, "" ) );
							}
						}
					}
				}

				// Fix #11809: Avoid leaking memory
				fragment = first = null;
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone(true);
			jQuery( insert[i] )[ original ]( elems );

			// Modern browsers can apply jQuery collections as arrays, but oldIE needs a .get()
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle ?

			// Use of this method is a temporary fix (more like optmization) until something better comes along,
			// since it was removed from specification and supported only in FF
			window.getDefaultComputedStyle( elem[ 0 ] ).display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = ( iframe[ 0 ].contentWindow || iframe[ 0 ].contentDocument ).document;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}


(function() {
	var a, shrinkWrapBlocksVal,
		div = document.createElement( "div" ),
		divReset =
			"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;" +
			"display:block;padding:0;margin:0;border:0";

	// Setup
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName( "a" )[ 0 ];

	a.style.cssText = "float:left;opacity:.5";

	// Make sure that element opacity exists
	// (IE uses filter instead)
	// Use a regex to work around a WebKit issue. See #5145
	support.opacity = /^0.5/.test( a.style.opacity );

	// Verify style float existence
	// (IE uses styleFloat instead of cssFloat)
	support.cssFloat = !!a.style.cssFloat;

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Null elements to avoid leaks in IE.
	a = div = null;

	support.shrinkWrapBlocks = function() {
		var body, container, div, containerStyles;

		if ( shrinkWrapBlocksVal == null ) {
			body = document.getElementsByTagName( "body" )[ 0 ];
			if ( !body ) {
				// Test fired too early or in an unsupported environment, exit.
				return;
			}

			containerStyles = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px";
			container = document.createElement( "div" );
			div = document.createElement( "div" );

			body.appendChild( container ).appendChild( div );

			// Will be changed later if needed.
			shrinkWrapBlocksVal = false;

			if ( typeof div.style.zoom !== strundefined ) {
				// Support: IE6
				// Check if elements with layout shrink-wrap their children
				div.style.cssText = divReset + ";width:1px;padding:1px;zoom:1";
				div.innerHTML = "<div></div>";
				div.firstChild.style.width = "5px";
				shrinkWrapBlocksVal = div.offsetWidth !== 3;
			}

			body.removeChild( container );

			// Null elements to avoid leaks in IE.
			body = container = div = null;
		}

		return shrinkWrapBlocksVal;
	};

})();
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );



var getStyles, curCSS,
	rposition = /^(top|right|bottom|left)$/;

if ( window.getComputedStyle ) {
	getStyles = function( elem ) {
		return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
	};

	curCSS = function( elem, name, computed ) {
		var width, minWidth, maxWidth, ret,
			style = elem.style;

		computed = computed || getStyles( elem );

		// getPropertyValue is only needed for .css('filter') in IE9, see #12537
		ret = computed ? computed.getPropertyValue( name ) || computed[ name ] : undefined;

		if ( computed ) {

			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

				// Remember the original values
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				// Put in the new values to get a computed value out
				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				// Revert the changed values
				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		// Support: IE
		// IE returns zIndex value as an integer.
		return ret === undefined ?
			ret :
			ret + "";
	};
} else if ( document.documentElement.currentStyle ) {
	getStyles = function( elem ) {
		return elem.currentStyle;
	};

	curCSS = function( elem, name, computed ) {
		var left, rs, rsLeft, ret,
			style = elem.style;

		computed = computed || getStyles( elem );
		ret = computed ? computed[ name ] : undefined;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rs = elem.runtimeStyle;
			rsLeft = rs && rs.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				rs.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				rs.left = rsLeft;
			}
		}

		// Support: IE
		// IE returns zIndex value as an integer.
		return ret === undefined ?
			ret :
			ret + "" || "auto";
	};
}




function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			var condition = conditionFn();

			if ( condition == null ) {
				// The test was not ready at this point; screw the hook this time
				// but check again when needed next time.
				return;
			}

			if ( condition ) {
				// Hook not needed (or it's not possible to use it due to missing dependency),
				// remove it.
				// Since there are no other hooks for marginRight, remove the whole object.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.

			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	var a, reliableHiddenOffsetsVal, boxSizingVal, boxSizingReliableVal,
		pixelPositionVal, reliableMarginRightVal,
		div = document.createElement( "div" ),
		containerStyles = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px",
		divReset =
			"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;" +
			"display:block;padding:0;margin:0;border:0";

	// Setup
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName( "a" )[ 0 ];

	a.style.cssText = "float:left;opacity:.5";

	// Make sure that element opacity exists
	// (IE uses filter instead)
	// Use a regex to work around a WebKit issue. See #5145
	support.opacity = /^0.5/.test( a.style.opacity );

	// Verify style float existence
	// (IE uses styleFloat instead of cssFloat)
	support.cssFloat = !!a.style.cssFloat;

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Null elements to avoid leaks in IE.
	a = div = null;

	jQuery.extend(support, {
		reliableHiddenOffsets: function() {
			if ( reliableHiddenOffsetsVal != null ) {
				return reliableHiddenOffsetsVal;
			}

			var container, tds, isSupported,
				div = document.createElement( "div" ),
				body = document.getElementsByTagName( "body" )[ 0 ];

			if ( !body ) {
				// Return for frameset docs that don't have a body
				return;
			}

			// Setup
			div.setAttribute( "className", "t" );
			div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

			container = document.createElement( "div" );
			container.style.cssText = containerStyles;

			body.appendChild( container ).appendChild( div );

			// Support: IE8
			// Check if table cells still have offsetWidth/Height when they are set
			// to display:none and there are still other visible table cells in a
			// table row; if so, offsetWidth/Height are not reliable for use when
			// determining if an element has been hidden directly using
			// display:none (it is still safe to use offsets if a parent element is
			// hidden; don safety goggles and see bug #4512 for more information).
			div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
			tds = div.getElementsByTagName( "td" );
			tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
			isSupported = ( tds[ 0 ].offsetHeight === 0 );

			tds[ 0 ].style.display = "";
			tds[ 1 ].style.display = "none";

			// Support: IE8
			// Check if empty table cells still have offsetWidth/Height
			reliableHiddenOffsetsVal = isSupported && ( tds[ 0 ].offsetHeight === 0 );

			body.removeChild( container );

			// Null elements to avoid leaks in IE.
			div = body = null;

			return reliableHiddenOffsetsVal;
		},

		boxSizing: function() {
			if ( boxSizingVal == null ) {
				computeStyleTests();
			}
			return boxSizingVal;
		},

		boxSizingReliable: function() {
			if ( boxSizingReliableVal == null ) {
				computeStyleTests();
			}
			return boxSizingReliableVal;
		},

		pixelPosition: function() {
			if ( pixelPositionVal == null ) {
				computeStyleTests();
			}
			return pixelPositionVal;
		},

		reliableMarginRight: function() {
			var body, container, div, marginDiv;

			// Use window.getComputedStyle because jsdom on node.js will break without it.
			if ( reliableMarginRightVal == null && window.getComputedStyle ) {
				body = document.getElementsByTagName( "body" )[ 0 ];
				if ( !body ) {
					// Test fired too early or in an unsupported environment, exit.
					return;
				}

				container = document.createElement( "div" );
				div = document.createElement( "div" );
				container.style.cssText = containerStyles;

				body.appendChild( container ).appendChild( div );

				// Check if div with explicit width and no margin-right incorrectly
				// gets computed margin-right based on width of container. (#3333)
				// Fails in WebKit before Feb 2011 nightlies
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				marginDiv = div.appendChild( document.createElement( "div" ) );
				marginDiv.style.cssText = div.style.cssText = divReset;
				marginDiv.style.marginRight = marginDiv.style.width = "0";
				div.style.width = "1px";

				reliableMarginRightVal =
					!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );

				body.removeChild( container );
			}

			return reliableMarginRightVal;
		}
	});

	function computeStyleTests() {
		var container, div,
			body = document.getElementsByTagName( "body" )[ 0 ];

		if ( !body ) {
			// Test fired too early or in an unsupported environment, exit.
			return;
		}

		container = document.createElement( "div" );
		div = document.createElement( "div" );
		container.style.cssText = containerStyles;

		body.appendChild( container ).appendChild( div );

		div.style.cssText =
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;" +
				"position:absolute;display:block;padding:1px;border:1px;width:4px;" +
				"margin-top:1%;top:1%";

		// Workaround failing boxSizing test due to offsetWidth returning wrong value
		// with some non-1 values of body zoom, ticket #13543
		jQuery.swap( body, body.style.zoom != null ? { zoom: 1 } : {}, function() {
			boxSizingVal = div.offsetWidth === 4;
		});

		// Will be changed later if needed.
		boxSizingReliableVal = true;
		pixelPositionVal = false;
		reliableMarginRightVal = true;

		// Use window.getComputedStyle because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			pixelPositionVal = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			boxSizingReliableVal =
				( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";
		}

		body.removeChild( container );

		// Null elements to avoid leaks in IE.
		div = body = null;
	}

})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
		ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity\s*=\s*([^)]*)/,

	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];


// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = jQuery._data( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {

			if ( !values[ index ] ) {
				hidden = isHidden( elem );

				if ( display && display !== "none" || !hidden ) {
					jQuery._data( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
				}
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = support.boxSizing() && jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set. See: #7116
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifing setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !support.clearCloneStyle && value === "" && name.indexOf("background") === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {

				// Support: IE
				// Swallow errors from 'invalid' CSS values (#5509)
				try {
					// Support: Chrome, Safari
					// Setting style to blank string required to delete "style: x !important;"
					style[ name ] = "";
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var num, val, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return elem.offsetWidth === 0 && rdisplayswap.test( jQuery.css( elem, "display" ) ) ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					support.boxSizing() && jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

if ( !support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			// if value === "", then remove inline opacity #12685
			if ( ( value >= 1 || value === "" ) &&
					jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
					style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there is no filter style applied in a css rule or unset inline opacity, we are done
				if ( value === "" || currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			// Work around by temporarily setting element display to inline-block
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9
// Panic based approach to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*
					// Use a string for doubling factor so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur()
				// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// we're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, dDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = jQuery._data( elem, "fxshow" );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );
		dDisplay = defaultDisplay( elem.nodeName );
		if ( display === "none" ) {
			display = dDisplay;
		}
		if ( display === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !support.inlineBlockNeedsLayout || dDisplay === "inline" ) {
				style.display = "inline-block";
			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !support.shrinkWrapBlocks() ) {
			anim.always(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = jQuery._data( elem, "fxshow", {} );
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery._removeData( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {
	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || jQuery._data( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = jQuery._data( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	var a, input, select, opt,
		div = document.createElement("div" );

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName("a")[ 0 ];

	// First batch of tests.
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	a.style.cssText = "top:1px";

	// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
	support.getSetAttribute = div.className !== "t";

	// Get the style information from getAttribute
	// (IE uses .cssText instead)
	support.style = /top/.test( a.getAttribute("style") );

	// Make sure that URLs aren't manipulated
	// (IE normalizes it by default)
	support.hrefNormalized = a.getAttribute("href") === "/a";

	// Check the default checkbox/radio value ("" on WebKit; "on" elsewhere)
	support.checkOn = !!input.value;

	// Make sure that a selected-by-default option has a working selected property.
	// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
	support.optSelected = opt.selected;

	// Tests for enctype support on a form (#6743)
	support.enctype = !!document.createElement("form").enctype;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE8 only
	// Check if we can trust getAttribute("value")
	input = document.createElement( "input" );
	input.setAttribute( "value", "" );
	support.input = input.getAttribute( "value" ) === "";

	// Check if an input maintains its value after becoming a radio
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";

	// Null elements to avoid leaks in IE.
	a = input = select = opt = div = null;
})();


var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					jQuery.text( elem );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// oldIE doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					if ( jQuery.inArray( jQuery.valHooks.option.get( option ), values ) >= 0 ) {

						// Support: IE6
						// When new option element is added to select box we need to
						// force reflow of newly added node in order to workaround delay
						// of initialization properties
						try {
							option.selected = optionSet = true;

						} catch ( _ ) {

							// Will be executed only in IE6
							option.scrollHeight;
						}

					} else {
						option.selected = false;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}

				return options;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			// Support: Webkit
			// "" is returned instead of "on" if a value isn't specified
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle,
	ruseDefault = /^(?:checked|selected)$/i,
	getSetAttribute = support.getSetAttribute,
	getSetInput = support.input;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
						elem[ propName ] = false;
					// Support: IE<9
					// Also clear defaultChecked/defaultSelected (if appropriate)
					} else {
						elem[ jQuery.camelCase( "default-" + name ) ] =
							elem[ propName ] = false;
					}

				// See #9699 for explanation of this approach (setting first, then removal)
				} else {
					jQuery.attr( elem, name, "" );
				}

				elem.removeAttribute( getSetAttribute ? name : propName );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
			// IE<8 needs the *property* name
			elem.setAttribute( !getSetAttribute && jQuery.propFix[ name ] || name, name );

		// Use defaultChecked and defaultSelected for oldIE
		} else {
			elem[ jQuery.camelCase( "default-" + name ) ] = elem[ name ] = true;
		}

		return name;
	}
};

// Retrieve booleans specially
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {

	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = getSetInput && getSetAttribute || !ruseDefault.test( name ) ?
		function( elem, name, isXML ) {
			var ret, handle;
			if ( !isXML ) {
				// Avoid an infinite loop by temporarily removing this function from the getter
				handle = attrHandle[ name ];
				attrHandle[ name ] = ret;
				ret = getter( elem, name, isXML ) != null ?
					name.toLowerCase() :
					null;
				attrHandle[ name ] = handle;
			}
			return ret;
		} :
		function( elem, name, isXML ) {
			if ( !isXML ) {
				return elem[ jQuery.camelCase( "default-" + name ) ] ?
					name.toLowerCase() :
					null;
			}
		};
});

// fix oldIE attroperties
if ( !getSetInput || !getSetAttribute ) {
	jQuery.attrHooks.value = {
		set: function( elem, value, name ) {
			if ( jQuery.nodeName( elem, "input" ) ) {
				// Does not return so that setAttribute is also used
				elem.defaultValue = value;
			} else {
				// Use nodeHook if defined (#1954); otherwise setAttribute is fine
				return nodeHook && nodeHook.set( elem, value, name );
			}
		}
	};
}

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = {
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				elem.setAttributeNode(
					(ret = elem.ownerDocument.createAttribute( name ))
				);
			}

			ret.value = value += "";

			// Break association with cloned elements by also using setAttribute (#9646)
			if ( name === "value" || value === elem.getAttribute( name ) ) {
				return value;
			}
		}
	};

	// Some attributes are constructed with empty-string values when not defined
	attrHandle.id = attrHandle.name = attrHandle.coords =
		function( elem, name, isXML ) {
			var ret;
			if ( !isXML ) {
				return (ret = elem.getAttributeNode( name )) && ret.value !== "" ?
					ret.value :
					null;
			}
		};

	// Fixing value retrieval on a button requires this module
	jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			if ( ret && ret.specified ) {
				return ret.value;
			}
		},
		set: nodeHook.set
	};

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		set: function( elem, value, name ) {
			nodeHook.set( elem, value === "" ? false : value, name );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		};
	});
}

if ( !support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Note: IE uppercases css property names, but if we were to .toLowerCase()
			// .cssText, that would destroy case senstitivity in URL's, like in "background"
			return elem.style.cssText || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = value + "" );
		}
	};
}




var rfocusable = /^(?:input|select|textarea|button|object)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				return tabindex ?
					parseInt( tabindex, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						-1;
			}
		}
	}
});

// Some attributes require a special call on IE
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !support.hrefNormalized ) {
	// href/src property should get the full normalized URL (#10299/#12915)
	jQuery.each([ "href", "src" ], function( i, name ) {
		jQuery.propHooks[ name ] = {
			get: function( elem ) {
				return elem.getAttribute( name, 4 );
			}
		};
	});
}

// Support: Safari, IE9+
// mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});

// IE6/7 call enctype encoding
if ( !support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			i = 0,
			len = this.length,
			proceed = typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			i = 0,
			len = this.length,
			proceed = arguments.length === 0 || typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



var rvalidtokens = /(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g;

jQuery.parseJSON = function( data ) {
	// Attempt to parse using the native JSON parser first
	if ( window.JSON && window.JSON.parse ) {
		// Support: Android 2.3
		// Workaround failure to string-cast null input
		return window.JSON.parse( data + "" );
	}

	var requireNonComma,
		depth = null,
		str = jQuery.trim( data + "" );

	// Guard against invalid (and possibly dangerous) input by ensuring that nothing remains
	// after removing valid tokens
	return str && !jQuery.trim( str.replace( rvalidtokens, function( token, comma, open, close ) {

		// Force termination if we see a misplaced comma
		if ( requireNonComma && comma ) {
			depth = 0;
		}

		// Perform no more replacements after returning to outermost depth
		if ( depth === 0 ) {
			return token;
		}

		// Commas must not follow "[", "{", or ","
		requireNonComma = open || comma;

		// Determine new depth
		// array/object open ("[" or "{"): depth += true - false (increment)
		// array/object close ("]" or "}"): depth += false - true (decrement)
		// other cases ("," or primitive): depth += true - true (numeric cast)
		depth += !close - !open;

		// Remove this token
		return "";
	}) ) ?
		( Function( "return " + str ) )() :
		jQuery.error( "Invalid JSON: " + data );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	try {
		if ( window.DOMParser ) { // Standard
			tmp = new DOMParser();
			xml = tmp.parseFromString( data, "text/xml" );
		} else { // IE
			xml = new ActiveXObject( "Microsoft.XMLDOM" );
			xml.async = "false";
			xml.loadXML( data );
		}
	} catch( e ) {
		xml = undefined;
	}
	if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	// Document location
	ajaxLocParts,
	ajaxLocation,

	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType.charAt( 0 ) === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var deep, key,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {
	var firstDataType, ct, finalDataType, type,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // Cross-domain detection vars
			parts,
			// Loop variable
			i,
			// URL without anti-cache param
			cacheURL,
			// Response headers as string
			responseHeadersString,
			// timeout handle
			timeoutTimer,

			// To know if global events are to be dispatched
			fireGlobals,

			transport,
			// Response headers
			responseHeaders,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});

// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0 ||
		(!support.reliableHiddenOffsets() &&
			((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
};

jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;
			// Use .is(":disabled") so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject !== undefined ?
	// Support: IE6+
	function() {

		// XHR cannot access local files, always use ActiveX for that case
		return !this.isLocal &&

			// Support: IE7-8
			// oldIE XHR does not support non-RFC2616 methods (#13240)
			// See http://msdn.microsoft.com/en-us/library/ie/ms536648(v=vs.85).aspx
			// and http://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html#sec9
			// Although this check for six methods instead of eight
			// since IE also does not support "trace" and "connect"
			/^(get|post|head|put|delete|options)$/i.test( this.type ) &&

			createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

var xhrId = 0,
	xhrCallbacks = {},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE<10
// Open requests must be manually aborted on unload (#5280)
if ( window.ActiveXObject ) {
	jQuery( window ).on( "unload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]( undefined, true );
		}
	});
}

// Determine support properties
support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
xhrSupported = support.ajax = !!xhrSupported;

// Create transport if the browser can provide an xhr
if ( xhrSupported ) {

	jQuery.ajaxTransport(function( options ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !options.crossDomain || support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {
					var i,
						xhr = options.xhr(),
						id = ++xhrId;

					// Open the socket
					xhr.open( options.type, options.url, options.async, options.username, options.password );

					// Apply custom fields if provided
					if ( options.xhrFields ) {
						for ( i in options.xhrFields ) {
							xhr[ i ] = options.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( options.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( options.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !options.crossDomain && !headers["X-Requested-With"] ) {
						headers["X-Requested-With"] = "XMLHttpRequest";
					}

					// Set headers
					for ( i in headers ) {
						// Support: IE<9
						// IE's ActiveXObject throws a 'Type Mismatch' exception when setting
						// request header to a null-value.
						//
						// To keep consistent with other XHR implementations, cast the value
						// to string and ignore `undefined`.
						if ( headers[ i ] !== undefined ) {
							xhr.setRequestHeader( i, headers[ i ] + "" );
						}
					}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( options.hasContent && options.data ) || null );

					// Listener
					callback = function( _, isAbort ) {
						var status, statusText, responses;

						// Was never called and is aborted or complete
						if ( callback && ( isAbort || xhr.readyState === 4 ) ) {
							// Clean up
							delete xhrCallbacks[ id ];
							callback = undefined;
							xhr.onreadystatechange = jQuery.noop;

							// Abort manually if needed
							if ( isAbort ) {
								if ( xhr.readyState !== 4 ) {
									xhr.abort();
								}
							} else {
								responses = {};
								status = xhr.status;

								// Support: IE<10
								// Accessing binary-data responseText throws an exception
								// (#11426)
								if ( typeof xhr.responseText === "string" ) {
									responses.text = xhr.responseText;
								}

								// Firefox throws an exception when accessing
								// statusText for faulty cross-domain requests
								try {
									statusText = xhr.statusText;
								} catch( e ) {
									// We normalize with Webkit giving an empty statusText
									statusText = "";
								}

								// Filter status for non standard behaviors

								// If the request is local and we have data: assume a success
								// (success with no data won't get notified, that's the best we
								// can do given current implementations)
								if ( !status && options.isLocal && !options.crossDomain ) {
									status = responses.text ? 200 : 404;
								// IE - #1450: sometimes returns 1223 when it should be 204
								} else if ( status === 1223 ) {
									status = 204;
								}
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, xhr.getAllResponseHeaders() );
						}
					};

					if ( !options.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback );
					} else {
						// Add to the list of active xhr callbacks
						xhr.onreadystatechange = xhrCallbacks[ id ] = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback( undefined, true );
					}
				}
			};
		}
	});
}

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject( "Microsoft.XMLHTTP" );
	} catch( e ) {}
}




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || jQuery("head")[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement("script");

				script.async = true;

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( script.parentNode ) {
							script.parentNode.removeChild( script );
						}

						// Dereference the script
						script = null;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};

				// Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
				// Use native DOM manipulation to avoid our domManip AJAX trickery
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( undefined, true );
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, response, type,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off, url.length );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};





var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			jQuery.inArray("auto", [ curCSSTop, curCSSLeft ] ) > -1;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			box = { top: 0, left: 0 },
			elem = this[ 0 ],
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// If we don't have gBCR, just use 0,0 rather than error
		// BlackBerry 5, iOS 3 (original iPhone)
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top  + ( win.pageYOffset || docElem.scrollTop )  - ( docElem.clientTop  || 0 ),
			left: box.left + ( win.pageXOffset || docElem.scrollLeft ) - ( docElem.clientLeft || 0 )
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			parentOffset = { top: 0, left: 0 },
			elem = this[ 0 ];

		// fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// we assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();
		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top  += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		return {
			top:  offset.top  - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true)
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// getComputedStyle returns percent when specified for top/left/bottom/right
// rather than make the css module depend on the offset module, we just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// if curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in
// AMD (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

/**
 * Gets config from SASS so that it can be refrenced on the front end.
 */

(function(global, factory) {
  // Common JS (i.e. browserify) environment
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    module.exports = factory(require('underscore'), require('jquery'));
  }
  // AMD
  else if (typeof define === 'function' && define.amd) {
    define('mpConfig',['underscore', 'jquery'], factory);
  }
  // Browser global
  else if (global._ && global.jQuery.fn.dataTable) {
    global.MP = global.MP || {};
    global.MP.colors = factory(global._, global.jQuery);
  }
  else {
    throw new Error('Could not find dependencies for MinnPost Styles Config.' );
  }
})(typeof window !== 'undefined' ? window : this, function(_, $, dt) {
  // Placeholder for config and other vars
  var config = {};
  var lists;

  // We use the build process to replace this data.  Hacky for sure.
  config = {
  "selector-wrapper": ".mp",
  "responsive-points": [
    [
      "all",
      "0px"
    ],
    [
      "small",
      "420px"
    ],
    [
      "medium",
      "640px"
    ],
    [
      "large",
      "960px"
    ],
    [
      "xlarge",
      "1200px"
    ]
  ],
  "grid-gutter": "0.5em",
  "text-line-height": "1.5em",
  "text-size": "1em",
  "text-size-small": "0.85em",
  "text-size-large": "1.25em",
  "space": "1em",
  "space-vertical-padding": "0.25em",
  "space-horizontal-padding": "0.5em",
  "space-vertical-margin": "1em",
  "space-horizontal-margin": "1em",
  "radius": "0.25em",
  "font-size-base": "16px",
  "font-text": "\"Open Sans\", Helvetica, Arial, \"Lucida Grande\", sans-serif",
  "font-heading": "\"Montserrat\", Georgia, \"Times New Roman\", Times, sans-serif",
  "font-monospace": "Menlo, Monaco, Consolas, \"Courier New\", monospace",
  "color-white": "#FFFFFF",
  "color-black": "#000000",
  "color-dark-gray": "#282828",
  "color-medium-gray": "#404040",
  "color-gray": "#7A7A7A",
  "color-light-gray": "#ABABAB",
  "color-lighter-gray": "#CCCCCC",
  "color-lightest-gray": "#F8F8F8",
  "color-minnpost-red": "#801019",
  "color-blue": "#0084A8",
  "color-red": "#C83D2D",
  "color-green": "#469B61",
  "color-orange": "#FF6633",
  "color-yellow": "#FBD341",
  "colors-interface": [
    [
      "dark-gray",
      "$color-dark-gray"
    ],
    [
      "medium-gray",
      "$color-medium-gray"
    ],
    [
      "gray",
      "$color-gray"
    ],
    [
      "light-gray",
      "$color-light-gray"
    ],
    [
      "lighter-gray",
      "$color-lighter-gray"
    ],
    [
      "lightest-gray",
      "$color-lightest-gray"
    ],
    [
      "minnpost-red",
      "$color-minnpost-red"
    ],
    [
      "blue",
      "$color-blue"
    ],
    [
      "red",
      "$color-red"
    ],
    [
      "green",
      "$color-green"
    ],
    [
      "orange",
      "$color-orange"
    ],
    [
      "yellow",
      "$color-yellow"
    ]
  ],
  "color-link": "$color-blue",
  "color-heading": "$color-dark-gray",
  "color-text": "$color-medium-gray",
  "colors-information": [
    [
      "primary",
      "$color-blue"
    ],
    [
      "success",
      "$color-green"
    ],
    [
      "info",
      "$color-light-gray"
    ],
    [
      "warning",
      "$color-yellow"
    ],
    [
      "danger",
      "$color-red"
    ]
  ],
  "colors-data": [
    [
      "green1",
      "#1D8C47"
    ],
    [
      "green2",
      "#32955D"
    ],
    [
      "green3",
      "#36A174"
    ],
    [
      "purple",
      "#55307E"
    ],
    [
      "blue1",
      "#0D57A0"
    ],
    [
      "blue2",
      "#0793AB"
    ],
    [
      "blue3",
      "#55CBDD"
    ],
    [
      "red",
      "#C83D2D"
    ],
    [
      "orange",
      "#FF6633"
    ],
    [
      "yellow",
      "#FBD341"
    ]
  ]
};

  // Function to help turn a config value into another if it is a reference
  function findReference(value) {
    if (_.isString(value) && value.indexOf('$') === 0 && !_.isUndefined(config[value.substring(1)])) {
      value = config[value.substring(1)];
    }
    return value;
  }

  // Process config
  if (_.isObject(config)) {
    // Process the lists that are meant to be objects
    lists = ['responsive-points', 'colors-data', 'colors-information', 'colors-interface'];
    _.each(lists, function(l, li) {
      var converted = {};

      if (!_.isUndefined(config[l])) {
        _.each(config[l], function(i, ii) {
          converted[i[0]] = findReference(i[1]);
        });

        config[l] = converted;
      }
    });
  }

  return config;

});

/**
 * Formatters
 */

(function(global, factory) {
  // Common JS (i.e. browserify) environment
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    module.exports = factory(require('underscore'));
  }
  // AMD
  else if (typeof define === 'function' && define.amd) {
    define('mpFormatters',['underscore'], factory);
  }
  // Browser global
  else if (global._) {
    global.MP = global.MP || {};
    global.MP.formatters = factory(global._);
  }
  else {
    throw new Error('Could not find dependencies for MinnPost Styles Formatters.' );
  }
})(typeof window !== 'undefined' ? window : this, function(_) {

  // Placeholder for formatters stuff
  var formatters = {};

  // Format number
  formatters.number = function(num, decimals) {
    decimals = (decimals || decimals === 0) ? decimals : 2;
    var rgx = (/(\d+)(\d{3})/);
    split = num.toFixed(decimals).toString().split('.');

    while (rgx.test(split[0])) {
      split[0] = split[0].replace(rgx, '$1' + ',' + '$2');
    }
    return (decimals) ? split[0] + '.' + split[1] : split[0];
  };

  // Format integer
  formatters.integer = function(num, round) {
    round = round || true;
    num = (round) ? Math.round(num) : num;
    return formatters.number(num, 0);
  };

  // Basic US currency
  formatters.currency = function(num) {
    return '$' + formatters.number(num, 2);
  };

  // Percentage
  formatters.percent = function(num, decimals) {
    decimals = (decimals || decimals === 0) ? decimals : 1;
    return formatters.number(num * 100, decimals) + '%';
  };

  // Percent change
  formatters.percentChange = function(num, decimals) {
    return ((num > 0) ? '+' : '') + formatters.percent(num, decimals);
  };

  // Number change
  formatters.change = function(num, decimals) {
    decimals = (decimals || decimals === 0) ? decimals : 2;
    return ((num > 0) ? '+' : '') + formatters.number(num);
  };

  // Converts string into a hash (very basically).
  formatters.hash = function(str) {
    return Math.abs(_.reduce(str.split(''), function(a, b) {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0));
  };

  // Identifier/slug maker
  formatters.identifier = function(str) {
    return str.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-').replace(/[^\w-]+/g,'');
  };

  return formatters;

});

/**
 * Navigation interaction
 */

(function(global, factory) {
  // Common JS (i.e. browserify) environment
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    module.exports = factory(require('jquery'), require('underscore'));
  }
  // AMD?
  else if (typeof define === 'function' && define.amd) {
    define('mpNav',['jquery', 'underscore'], factory);
  }
  // Browser global
  else if (global.jQuery && global._) {
    global.MP = global.MP || {};
    global.MP.nav = factory(global.jQuery, global._);
  }
  else {
    throw new Error('Could not find dependencies for MinnPost Styles Navigation.' );
  }
})(typeof window !== 'undefined' ? window : this, function($, _) {

  // Wrapper object for some various things
  var nav = {};

  // Plugin for sticking things.  Defaults are for sticking to top.
  nav.MPStickDefaults = {
    activeClass: 'stuck top',
    wrapperClass: 'minnpost-full-container',
    topPadding: 0,
    throttle: 90
  };
  function MPStick(element, options) {
    // Defined some values and process options
    this.element = element;
    this.$element = $(element);
    this._defaults = nav.MPStickDefaults;
    this.options = $.extend( {}, this._defaults, options);
    this._name = 'mpStick';
    this._scrollEvent = 'scroll.mp.mpStick';
    this._on = false;

    this.init();
  }
  MPStick.prototype = {
    init: function() {
      // If contaier not passed, use parent
      this.$container = (this.options.container === undefined) ? this.$element.parent() : $(this.options.container);

      this.elementHeight = this.$element.outerHeight(true);

      // Create a spacer element so content doesn't jump
      this.$spacer = $('<div>').height(this.elementHeight).hide();
      this.$element.after(this.$spacer);

      // Add wrapper
      if (this.options.wrapperClass) {
        this.$element.wrapInner('<div class="' + this.options.wrapperClass + '"></div>');
      }

      // Throttle the scoll listen for better perfomance
      this._throttledListen = _.bind(_.throttle(this.listen, this.options.throttle), this);
      this._throttledListen();
      $(window).on(this._scrollEvent, this._throttledListen);
    },

    listen: function() {
      var containerTop = this.$container.offset().top;
      var containerBottom = containerTop + this.$container.height();
      var scrollTop = $(window).scrollTop();
      var top = (containerTop - this.options.topPadding);
      var bottom = (containerBottom - this.elementHeight - this.options.topPadding - 2);

      // Test whether we are in the container and whether its
      // already stuck or not
      if (!this._on && scrollTop > top && scrollTop < bottom) {
        this.on();
      }
      else if (this._on && (scrollTop < top || scrollTop > bottom)) {
        this.off();
      }
    },

    on: function() {
      this.$element.addClass(this.options.activeClass);
      if (this.options.topPadding) {
        this.$element.css('top', this.options.topPadding);
      }
      this.$spacer.show();
      this._on = true;
    },

    off: function() {
      this.$element.removeClass(this.options.activeClass);
      if (this.options.topPadding) {
        this.$element.css('top', 'inherit');
      }
      this.$spacer.hide();
      this._on = false;
    },

    remove: function() {
      this.$container.off(this._scrollEvent);
    }
  };
  // Register plugin
  $.fn.mpStick = function(options) {
    return this.each(function() {
      if (!$.data(this, 'mpStick')) {
        $.data(this, 'mpStick', new MPStick(this, options));
      }
    });
  };



  // Plugin for scroll spying
  nav.MPScrollSpyDefaults = {
    activeClass: 'active',
    offset: 80,
    throttle: 200
  };
  function MPScrollSpy(element, options) {
    // Set some initial values and options
    this.element = element;
    this.$element = $(element);
    this._defaults = nav.MPScrollSpyDefaults;
    this.options = $.extend( {}, this._defaults, options);
    this._name = 'mpScollSpy';
    this._scrollEvent = 'scroll.mp.mpScollSpy';

    this.init();
  }
  MPScrollSpy.prototype = {
    init: function() {
      // Get listeners and targets
      this.$listeners = this.$element.find('[data-spy-on]');
      this.$targets = this.$element.find('[data-spy-me]');

      // Throttle the scoll listen for better perfomance
      this._throttledListen = _.bind(_.throttle(this.listen, this.options.throttle), this);
      this._throttledListen();
      $(window).on(this._scrollEvent, this._throttledListen);

      // Handle click
      this.$listeners.on('click', _.bind(this.gotoClick, this));
    },

    listen: function() {
      var thisPlugin = this;
      var scrollTop = $(window).scrollTop();
      var target;

      // Find target that is closest to scroll top
      this.$targets.each(function() {
        var $target = $(this);
        if ($target.offset().top <= (scrollTop + (thisPlugin.options.offset + 5))) {
          target = $target.data('spyMe');
        }
      });

      // Once found one, then mark the listener
      if (target) {
        this.$listeners.removeClass(this.options.activeClass);
        this.$element.find('[data-spy-on="' + target + '"]').addClass(this.options.activeClass);
      }
    },

    gotoClick: function(e) {
      e.preventDefault();
      var $listener = $(e.target);

      this.goto($(e.target).data('spyOn'));
    },

    goto: function(target) {
      var $target = this.$element.find('[data-spy-me="' + target + '"]');
      var top = $target.offset().top;

      $('html, body').animate({
        scrollTop: (top - this.options.offset)
      }, 600);
    },

    remove: function() {
      this.$container.off(this._scrollEvent);
    }
  };
  // Register plugin
  $.fn.mpScrollSpy = function(options) {
    return this.each(function() {
      if (!$.data(this, 'mpScrollSpy')) {
        $.data(this, 'mpScrollSpy', new MPScrollSpy(this, options));
      }
    });
  };

  return nav;
});

//     Backbone.js 1.1.2

//     (c) 2010-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(root, factory) {

  // Set up Backbone appropriately for the environment. Start with AMD.
  if (typeof define === 'function' && define.amd) {
    define('backbone',['underscore', 'jquery', 'exports'], function(_, $, exports) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backbone.
      root.Backbone = factory(root, exports, _, $);
    });

  // Next for Node.js or CommonJS. jQuery may not be needed as a module.
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore');
    factory(root, exports, _);

  // Finally, as a browser global.
  } else {
    root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
  }

}(this, function(root, Backbone, _, $) {

  // Initial Setup
  // -------------

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create local references to array methods we'll want to use later.
  var array = [];
  var push = array.push;
  var slice = array.slice;
  var splice = array.splice;

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '1.1.2';

  // For Backbone's purposes, jQuery, Zepto, Ender, or My Library (kidding) owns
  // the `$` variable.
  Backbone.$ = $;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PATCH"`, `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {

    // Bind an event to a `callback` function. Passing `"all"` will bind
    // the callback to all events fired.
    on: function(name, callback, context) {
      if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
      this._events || (this._events = {});
      var events = this._events[name] || (this._events[name] = []);
      events.push({callback: callback, context: context, ctx: context || this});
      return this;
    },

    // Bind an event to only be triggered a single time. After the first time
    // the callback is invoked, it will be removed.
    once: function(name, callback, context) {
      if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
      var self = this;
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      return this.on(name, once, context);
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var retain, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = void 0;
        return this;
      }
      names = name ? [name] : _.keys(this._events);
      for (i = 0, l = names.length; i < l; i++) {
        name = names[i];
        if (events = this._events[name]) {
          this._events[name] = retain = [];
          if (callback || context) {
            for (j = 0, k = events.length; j < k; j++) {
              ev = events[j];
              if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                  (context && context !== ev.context)) {
                retain.push(ev);
              }
            }
          }
          if (!retain.length) delete this._events[name];
        }
      }

      return this;
    },

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    trigger: function(name) {
      if (!this._events) return this;
      var args = slice.call(arguments, 1);
      if (!eventsApi(this, 'trigger', name, args)) return this;
      var events = this._events[name];
      var allEvents = this._events.all;
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, arguments);
      return this;
    },

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    stopListening: function(obj, name, callback) {
      var listeningTo = this._listeningTo;
      if (!listeningTo) return this;
      var remove = !name && !callback;
      if (!callback && typeof name === 'object') callback = this;
      if (obj) (listeningTo = {})[obj._listenId] = obj;
      for (var id in listeningTo) {
        obj = listeningTo[id];
        obj.off(name, callback, this);
        if (remove || _.isEmpty(obj._events)) delete this._listeningTo[id];
      }
      return this;
    }

  };

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Implement fancy features of the Events API such as multiple event
  // names `"change blur"` and jQuery-style event maps `{change: action}`
  // in terms of the existing API.
  var eventsApi = function(obj, action, name, rest) {
    if (!name) return true;

    // Handle event maps.
    if (typeof name === 'object') {
      for (var key in name) {
        obj[action].apply(obj, [key, name[key]].concat(rest));
      }
      return false;
    }

    // Handle space separated event names.
    if (eventSplitter.test(name)) {
      var names = name.split(eventSplitter);
      for (var i = 0, l = names.length; i < l; i++) {
        obj[action].apply(obj, [names[i]].concat(rest));
      }
      return false;
    }

    return true;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
    }
  };

  var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

  // Inversion-of-control versions of `on` and `once`. Tell *this* object to
  // listen to an event in another object ... keeping track of what it's
  // listening to.
  _.each(listenMethods, function(implementation, method) {
    Events[method] = function(obj, name, callback) {
      var listeningTo = this._listeningTo || (this._listeningTo = {});
      var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
      listeningTo[id] = obj;
      if (!callback && typeof name === 'object') callback = this;
      obj[implementation](name, callback, this);
      return this;
    };
  });

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Backbone **Models** are the basic data object in the framework --
  // frequently representing a row in a table in a database on your server.
  // A discrete chunk of data and a bunch of useful, related methods for
  // performing computations and transformations on that data.

  // Create a new model with the specified attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    attrs = _.defaults({}, attrs, _.result(this, 'defaults'));
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  };

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The value returned during the last failed validation.
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function(key, val, options) {
      var attr, attrs, unset, changes, silent, changing, prev, current;
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      unset           = options.unset;
      silent          = options.silent;
      changes         = [];
      changing        = this._changing;
      this._changing  = true;

      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }
      current = this.attributes, prev = this._previousAttributes;

      // Check for changes of `id`.
      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      // For each `set` attribute, update or delete the current value.
      for (attr in attrs) {
        val = attrs[attr];
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        if (!_.isEqual(prev[attr], val)) {
          this.changed[attr] = val;
        } else {
          delete this.changed[attr];
        }
        unset ? delete current[attr] : current[attr] = val;
      }

      // Trigger all relevant attribute changes.
      if (!silent) {
        if (changes.length) this._pending = options;
        for (var i = 0, l = changes.length; i < l; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          options = this._pending;
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    // Remove an attribute from the model, firing `"change"`. `unset` is a noop
    // if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Fetch the model from the server. If the server's representation of the
    // model differs from its current attributes, they will be overridden,
    // triggering a `"change"` event.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        if (!model.set(model.parse(resp, options), options)) return false;
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      var attrs, method, xhr, attributes = this.attributes;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options = _.extend({validate: true}, options);

      // If we're not waiting and attributes exist, save acts as
      // `set(attr).save(null, opts)` with validation. Otherwise, check if
      // the model will be valid when the attributes, if any, are set.
      if (attrs && !options.wait) {
        if (!this.set(attrs, options)) return false;
      } else {
        if (!this._validate(attrs, options)) return false;
      }

      // Set temporary attributes if `{wait: true}`.
      if (attrs && options.wait) {
        this.attributes = _.extend({}, attributes, attrs);
      }

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = model.parse(resp, options);
        if (options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (_.isObject(serverAttrs) && !model.set(serverAttrs, options)) {
          return false;
        }
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch') options.attrs = attrs;
      xhr = this.sync(method, this, options);

      // Restore attributes.
      if (attrs && options.wait) this.attributes = attributes;

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;

      var destroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (options.wait || model.isNew()) destroy();
        if (success) success(model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      if (this.isNew()) {
        options.success();
        return false;
      }
      wrapError(this, options);

      var xhr = this.sync('delete', this, options);
      if (!options.wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base =
        _.result(this, 'urlRoot') ||
        _.result(this.collection, 'url') ||
        urlError();
      if (this.isNew()) return base;
      return base.replace(/([^\/])$/, '$1/') + encodeURIComponent(this.id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return !this.has(this.idAttribute);
    },

    // Check if the model is currently in a valid state.
    isValid: function(options) {
      return this._validate({}, _.extend(options || {}, { validate: true }));
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
      return false;
    }

  });

  // Underscore methods that we want to implement on the Model.
  var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit'];

  // Mix in each Underscore method as a proxy to `Model#attributes`.
  _.each(modelMethods, function(method) {
    Model.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.attributes);
      return _[method].apply(_, args);
    };
  });

  // Backbone.Collection
  // -------------------

  // If models tend to represent a single row of data, a Backbone Collection is
  // more analagous to a table full of data ... or a small slice or page of that
  // table, or a collection of rows that belong together for a particular reason
  // -- all of the messages in this particular folder, all of the documents
  // belonging to this particular author, and so on. Collections maintain
  // indexes of their models, both in order, and for lookup by `id`.

  // Create a new **Collection**, perhaps to contain a specific type of `model`.
  // If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, remove: false};

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set.
    add: function(models, options) {
      return this.set(models, _.extend({merge: false}, options, addOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
      var singular = !_.isArray(models);
      models = singular ? [models] : _.clone(models);
      options || (options = {});
      var i, l, index, model;
      for (i = 0, l = models.length; i < l; i++) {
        model = models[i] = this.get(models[i]);
        if (!model) continue;
        delete this._byId[model.id];
        delete this._byId[model.cid];
        index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        this._removeReference(model, options);
      }
      return singular ? models[0] : models;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
      options = _.defaults({}, options, setOptions);
      if (options.parse) models = this.parse(models, options);
      var singular = !_.isArray(models);
      models = singular ? (models ? [models] : []) : _.clone(models);
      var i, l, id, model, attrs, existing, sort;
      var at = options.at;
      var targetModel = this.model;
      var sortable = this.comparator && (at == null) && options.sort !== false;
      var sortAttr = _.isString(this.comparator) ? this.comparator : null;
      var toAdd = [], toRemove = [], modelMap = {};
      var add = options.add, merge = options.merge, remove = options.remove;
      var order = !sortable && add && remove ? [] : false;

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      for (i = 0, l = models.length; i < l; i++) {
        attrs = models[i] || {};
        if (attrs instanceof Model) {
          id = model = attrs;
        } else {
          id = attrs[targetModel.prototype.idAttribute || 'id'];
        }

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        if (existing = this.get(id)) {
          if (remove) modelMap[existing.cid] = true;
          if (merge) {
            attrs = attrs === model ? model.attributes : attrs;
            if (options.parse) attrs = existing.parse(attrs, options);
            existing.set(attrs, options);
            if (sortable && !sort && existing.hasChanged(sortAttr)) sort = true;
          }
          models[i] = existing;

        // If this is a new, valid model, push it to the `toAdd` list.
        } else if (add) {
          model = models[i] = this._prepareModel(attrs, options);
          if (!model) continue;
          toAdd.push(model);
          this._addReference(model, options);
        }

        // Do not add multiple models with the same `id`.
        model = existing || model;
        if (order && (model.isNew() || !modelMap[model.id])) order.push(model);
        modelMap[model.id] = true;
      }

      // Remove nonexistent models if appropriate.
      if (remove) {
        for (i = 0, l = this.length; i < l; ++i) {
          if (!modelMap[(model = this.models[i]).cid]) toRemove.push(model);
        }
        if (toRemove.length) this.remove(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      if (toAdd.length || (order && order.length)) {
        if (sortable) sort = true;
        this.length += toAdd.length;
        if (at != null) {
          for (i = 0, l = toAdd.length; i < l; i++) {
            this.models.splice(at + i, 0, toAdd[i]);
          }
        } else {
          if (order) this.models.length = 0;
          var orderedModels = order || toAdd;
          for (i = 0, l = orderedModels.length; i < l; i++) {
            this.models.push(orderedModels[i]);
          }
        }
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true});

      // Unless silenced, it's time to fire all appropriate add/sort events.
      if (!options.silent) {
        for (i = 0, l = toAdd.length; i < l; i++) {
          (model = toAdd[i]).trigger('add', model, this, options);
        }
        if (sort || (order && order.length)) this.trigger('sort', this, options);
      }

      // Return the added (or merged) model (or models).
      return singular ? models[0] : models;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
      options || (options = {});
      for (var i = 0, l = this.models.length; i < l; i++) {
        this._removeReference(this.models[i], options);
      }
      options.previousModels = this.models;
      this._reset();
      models = this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return models;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      return this.add(model, _.extend({at: this.length}, options));
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      return this.add(model, _.extend({at: 0}, options));
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function() {
      return slice.apply(this.models, arguments);
    },

    // Get a model from the set by id.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj] || this._byId[obj.id] || this._byId[obj.cid];
    },

    // Get the model at the given index.
    at: function(index) {
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      if (_.isEmpty(attrs)) return first ? void 0 : [];
      return this[first ? 'find' : 'filter'](function(model) {
        for (var key in attrs) {
          if (attrs[key] !== model.get(key)) return false;
        }
        return true;
      });
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      // Run sort based on type of `comparator`.
      if (_.isString(this.comparator) || this.comparator.length === 1) {
        this.models = this.sortBy(this.comparator, this);
      } else {
        this.models.sort(_.bind(this.comparator, this));
      }

      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return _.invoke(this.models, 'get', attr);
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success(collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      if (!(model = this._prepareModel(model, options))) return false;
      if (!options.wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(model, resp) {
        if (options.wait) collection.add(model, options);
        if (success) success(model, resp, options);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models);
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    _prepareModel: function(attrs, options) {
      if (attrs instanceof Model) return attrs;
      options = options ? _.clone(options) : {};
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model.validationError) return model;
      this.trigger('invalid', this, model.validationError, options);
      return false;
    },

    // Internal method to create a model's ties to a collection.
    _addReference: function(model, options) {
      this._byId[model.cid] = model;
      if (model.id != null) this._byId[model.id] = model;
      if (!model.collection) model.collection = this;
      model.on('all', this._onModelEvent, this);
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model, options) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (model && event === 'change:' + model.idAttribute) {
        delete this._byId[model.previous(model.idAttribute)];
        if (model.id != null) this._byId[model.id] = model;
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  // 90% of the core usefulness of Backbone Collections is actually implemented
  // right here:
  var methods = ['forEach', 'each', 'map', 'collect', 'reduce', 'foldl',
    'inject', 'reduceRight', 'foldr', 'find', 'detect', 'filter', 'select',
    'reject', 'every', 'all', 'some', 'any', 'include', 'contains', 'invoke',
    'max', 'min', 'toArray', 'size', 'first', 'head', 'take', 'initial', 'rest',
    'tail', 'drop', 'last', 'without', 'difference', 'indexOf', 'shuffle',
    'lastIndexOf', 'isEmpty', 'chain', 'sample'];

  // Mix in each Underscore method as a proxy to `Collection#models`.
  _.each(methods, function(method) {
    Collection.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.models);
      return _[method].apply(_, args);
    };
  });

  // Underscore methods that take a property name as an argument.
  var attributeMethods = ['groupBy', 'countBy', 'sortBy', 'indexBy'];

  // Use attributes instead of properties.
  _.each(attributeMethods, function(method) {
    Collection.prototype[method] = function(value, context) {
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _[method](this.models, iterator, context);
    };
  });

  // Backbone.View
  // -------------

  // Backbone Views are almost more convention than they are actual code. A View
  // is simply a JavaScript object that represents a logical chunk of UI in the
  // DOM. This might be a single item, an entire list, a sidebar or panel, or
  // even the surrounding frame which wraps your whole app. Defining a chunk of
  // UI as a **View** allows you to define your DOM events declaratively, without
  // having to worry about render order ... and makes it easy for the view to
  // react to specific changes in the state of your models.

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    options || (options = {});
    _.extend(this, _.pick(options, viewOptions));
    this._ensureElement();
    this.initialize.apply(this, arguments);
    this.delegateEvents();
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be merged as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be preferred to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this.$el.remove();
      this.stopListening();
      return this;
    },

    // Change the view's element (`this.el` property), including event
    // re-delegation.
    setElement: function(element, delegate) {
      if (this.$el) this.undelegateEvents();
      this.$el = element instanceof Backbone.$ ? element : Backbone.$(element);
      this.el = this.$el[0];
      if (delegate !== false) this.delegateEvents();
      return this;
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save',
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    // This only works for delegate-able events: not `focus`, `blur`, and
    // not `change`, `submit`, and `reset` in Internet Explorer.
    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) continue;

        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        method = _.bind(method, this);
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
          this.$el.on(eventName, method);
        } else {
          this.$el.on(eventName, selector, method);
        }
      }
      return this;
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        var $el = Backbone.$('<' + _.result(this, 'tagName') + '>').attr(attrs);
        this.setElement($el, false);
      } else {
        this.setElement(_.result(this, 'el'), false);
      }
    }

  });

  // Backbone.sync
  // -------------

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // If we're sending a `PATCH` request, and we're in an old Internet Explorer
    // that still has ActiveX enabled by default, override jQuery to use that
    // for XHR instead. Remove this line when jQuery supports `PATCH` on IE8.
    if (params.type === 'PATCH' && noXhrPatch) {
      params.xhr = function() {
        return new ActiveXObject("Microsoft.XMLHTTP");
      };
    }

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  var noXhrPatch =
    typeof window !== 'undefined' && !!window.ActiveXObject &&
      !(window.XMLHttpRequest && (new XMLHttpRequest).dispatchEvent);

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch':  'PATCH',
    'delete': 'DELETE',
    'read':   'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /(\(\?)?:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        router.execute(callback, args);
        router.trigger.apply(router, ['route:' + name].concat(args));
        router.trigger('route', name, args);
        Backbone.history.trigger('route', router, name, args);
      });
      return this;
    },

    // Execute a route handler with the provided parameters.  This is an
    // excellent place to do pre-route setup or post-route cleanup.
    execute: function(callback, args) {
      if (callback) callback.apply(this, args);
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional) {
                     return optional ? match : '([^/?]+)';
                   })
                   .replace(splatParam, '([^?]*?)');
      return new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted decoded parameters. Empty or unmatched parameters will be
    // treated as `null` to normalize cross-browser behavior.
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param, i) {
        // Don't decode the search params.
        if (i === params.length - 1) return param || null;
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on either
  // [pushState](http://diveintohtml5.info/history.html) and real URLs, or
  // [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
  // and URL fragments. If the browser supports neither (old IE, natch),
  // falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for detecting MSIE.
  var isExplorer = /msie [\w.]+/;

  // Cached regex for removing a trailing slash.
  var trailingSlash = /\/$/;

  // Cached regex for stripping urls of hash.
  var pathStripper = /#.*$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Are we at the app root?
    atRoot: function() {
      return this.location.pathname.replace(/[^\/]$/, '$&/') === this.root;
    },

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the cross-browser normalized URL fragment, either from the URL,
    // the hash, or the override.
    getFragment: function(fragment, forcePushState) {
      if (fragment == null) {
        if (this._hasPushState || !this._wantsHashChange || forcePushState) {
          fragment = decodeURI(this.location.pathname + this.location.search);
          var root = this.root.replace(trailingSlash, '');
          if (!fragment.indexOf(root)) fragment = fragment.slice(root.length);
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error("Backbone.history has already been started");
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
      var fragment          = this.getFragment();
      var docMode           = document.documentMode;
      var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      if (oldIE && this._wantsHashChange) {
        var frame = Backbone.$('<iframe src="javascript:0" tabindex="-1">');
        this.iframe = frame.hide().appendTo('body')[0].contentWindow;
        this.navigate(fragment);
      }

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._hasPushState) {
        Backbone.$(window).on('popstate', this.checkUrl);
      } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
        Backbone.$(window).on('hashchange', this.checkUrl);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      // Determine if we need to change the base url, for a pushState link
      // opened by a non-pushState browser.
      this.fragment = fragment;
      var loc = this.location;

      // Transition from hashChange to pushState or vice versa if both are
      // requested.
      if (this._wantsHashChange && this._wantsPushState) {

        // If we've started off with a route from a `pushState`-enabled
        // browser, but we're currently in a browser that doesn't support it...
        if (!this._hasPushState && !this.atRoot()) {
          this.fragment = this.getFragment(null, true);
          this.location.replace(this.root + '#' + this.fragment);
          // Return immediately as browser will do redirect to new url
          return true;

        // Or if we've started out with a hash-based route, but we're currently
        // in a browser where it could be `pushState`-based instead...
        } else if (this._hasPushState && this.atRoot() && loc.hash) {
          this.fragment = this.getHash().replace(routeStripper, '');
          this.history.replaceState({}, document.title, this.root + this.fragment);
        }

      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      Backbone.$(window).off('popstate', this.checkUrl).off('hashchange', this.checkUrl);
      if (this._checkUrlInterval) clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();
      if (current === this.fragment && this.iframe) {
        current = this.getFragment(this.getHash(this.iframe));
      }
      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl();
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragment) {
      fragment = this.fragment = this.getFragment(fragment);
      return _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: !!options};

      var url = this.root + (fragment = this.getFragment(fragment || ''));

      // Strip the hash for matching.
      fragment = fragment.replace(pathStripper, '');

      if (this.fragment === fragment) return;
      this.fragment = fragment;

      // Don't include a trailing slash on the root.
      if (fragment === '' && url !== '/') url = url.slice(0, -1);

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._hasPushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if(!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) return this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  // Wrap an optional error callback with a fallback error event.
  var wrapError = function(model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error(model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

  return Backbone;

}));


/**
 * Helpers functions such as formatters or extensions
 * to libraries.
 */
define('helpers', ['jquery', 'underscore', 'backbone'],
  function($, _, Backbone) {

  var helpers = {};


  /**
   * Override Backbone's ajax call to use JSONP by default as well
   * as force a specific callback to ensure that server side
   * caching is effective.
   */
  Backbone.ajax = function() {
    var options = arguments;

    if (options[0].dataTypeForce !== true) {
      options[0].dataType = 'jsonp';
      options[0].jsonpCallback = 'mpServerSideCachingHelper' +
        _.hash(options[0].url);
    }
    return Backbone.$.ajax.apply(Backbone.$, options);
  };


  /**
   * Returns version of MSIE.
   */
  helpers.isMSIE = function() {
    var match = /(msie) ([\w.]+)/i.exec(navigator.userAgent);
    return match ? parseInt(match[2], 10) : false;
  };

  /**
   * Wrapper for a JSONP request, the first set of options are for
   * the AJAX request, while the other are from the application.
   */
  helpers.jsonpRequest = function(requestOptions, appOptions) {
    options.dataType = 'jsonp';
    options.jsonpCallback = 'mpServerSideCachingHelper' +
      _.hash(options.url);

    if (appOptions.remoteProxy) {
      options.url = options.url + '&callback=mpServerSideCachingHelper';
      options.url = appOptions.remoteProxy + encodeURIComponent(options.url);
      options.cache = true;
    }

    return $.ajax.apply($, [options]);
  };

  /**
   * Data source handling.  For development, we can call
   * the data directly from the JSON file, but for production
   * we want to proxy for JSONP.
   *
   * `name` should be relative path to dataset
   * `options` are app options
   *
   * Returns jQuery's defferred object.
   */
  helpers.getLocalData = function(name, options) {
    var useJSONP = false;
    var defers = [];
    name = (_.isArray(name)) ? name : [ name ];

    // If the data path is not relative, then use JSONP
    if (options && options.paths && options.paths.data.indexOf('http') === 0) {
      useJSONP = true;
    }

    // Go through each file and add to defers
    _.each(name, function(d) {
      var defer;

      if (useJSONP) {
        defer = helpers.jsonpRequest({
          url: proxyPrefix + encodeURI(options.paths.data + d)
        }, options);
      }
      else {
        defer = $.getJSON(options.paths.data + d);
      }
      defers.push(defer);
    });

    return $.when.apply($, defers);
  };

  /**
   * Reads query string and turns into object.
   */
  helpers.parseQueryString = function() {
    var assoc  = {};
    var decode = function(s) {
      return decodeURIComponent(s.replace(/\+/g, " "));
    };
    var queryString = location.search.substring(1);
    var keyValues = queryString.split('&');

    _.each(keyValues, function(v, vi) {
      var key = v.split('=');
      if (key.length > 1) {
        assoc[decode(key[0])] = decode(key[1]);
      }
    });

    return assoc;
  };

  return helpers;
});

/**
 * Models
 */
define('models', ['underscore', 'backbone'],
  function(_, Backbone) {
  var models = {};

  // Base model
  models.Base = Backbone.Model.extend({
    initialize: function(data, options) {
      // Attach options
      this.options = options || {};
      this.app = options.app;

      // Call this in other models
      //models.NEWModel.__super__.initialize.apply(this, arguments);
    }

  });

  // Questions
  models.Question = models.Base.extend({
    idAttribute: 'questionid',

    // Something can come unanswerable, if it has not been answered already
    // or the answer is a skip
    makeUnanswerable: function() {
      var state = this.get('state');
      this.set('state', (state !== 'answered' || (state === 'answered' && this.get('answer') === 'S')) ? 'unanswerable' : state);
    }
  });

  // Candidates
  models.Candidate = models.Base.extend({
    idAttribute: 'candidateid'
  });

  // Category
  models.Category = models.Base.extend({
    idAttribute: 'categoryid'
  });

  // Return what we have
  return models;
});

/**
 * Collections
 */
define('collections', ['underscore', 'backbone', 'models'],
  function(_, Backbone, models) {
  var collections = {};

  // Base collection
  collections.Base = Backbone.Collection.extend({
    initialize: function(models, options) {
      // Attach options
      this.options = options || {};
      this.app = options.app;

      // Call this in other collections
      //collection.NEWCollection.__super__.initialize.apply(this, arguments);
    },

    setAll: function(set, options) {
      this.each(function(m, mi) {
        m.set(set, options);
      });
    }

  });

  // Questions
  collections.Questions = collections.Base.extend({
    model: models.Question
  });

  // Candidates
  collections.Candidates = collections.Base.extend({
    model: models.Candidate,

    comparator: 'last'
  });

  // Categories
  collections.Categories = collections.Base.extend({
    model: models.Category
  });

  // Return what we have
  return collections;
});

/*
	Ractive.js v0.4.0
	2014-04-08 - commit 276c0e2b

	http://ractivejs.org
	http://twitter.com/RactiveJS

	Released under the MIT License.
*/

( function( global ) {

	

	var noConflict = global.Ractive;

	var legacy = function() {

		var win, doc, exportedShims;
		if ( typeof window === 'undefined' ) {
			return;
		}
		win = window;
		doc = win.document;
		exportedShims = {};
		if ( !doc ) {
			return;
		}
		// Shims for older browsers
		if ( !Date.now ) {
			Date.now = function() {
				return +new Date();
			};
		}
		if ( !String.prototype.trim ) {
			String.prototype.trim = function() {
				return this.replace( /^\s+/, '' ).replace( /\s+$/, '' );
			};
		}
		// Polyfill for Object.keys
		// https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/keys
		if ( !Object.keys ) {
			Object.keys = function() {
				var hasOwnProperty = Object.prototype.hasOwnProperty,
					hasDontEnumBug = !{
						toString: null
					}.propertyIsEnumerable( 'toString' ),
					dontEnums = [
						'toString',
						'toLocaleString',
						'valueOf',
						'hasOwnProperty',
						'isPrototypeOf',
						'propertyIsEnumerable',
						'constructor'
					],
					dontEnumsLength = dontEnums.length;
				return function( obj ) {
					if ( typeof obj !== 'object' && typeof obj !== 'function' || obj === null ) {
						throw new TypeError( 'Object.keys called on non-object' );
					}
					var result = [];
					for ( var prop in obj ) {
						if ( hasOwnProperty.call( obj, prop ) ) {
							result.push( prop );
						}
					}
					if ( hasDontEnumBug ) {
						for ( var i = 0; i < dontEnumsLength; i++ ) {
							if ( hasOwnProperty.call( obj, dontEnums[ i ] ) ) {
								result.push( dontEnums[ i ] );
							}
						}
					}
					return result;
				};
			}();
		}
		// Array extras
		if ( !Array.prototype.indexOf ) {
			Array.prototype.indexOf = function( needle, i ) {
				var len;
				if ( i === undefined ) {
					i = 0;
				}
				if ( i < 0 ) {
					i += this.length;
				}
				if ( i < 0 ) {
					i = 0;
				}
				for ( len = this.length; i < len; i++ ) {
					if ( this.hasOwnProperty( i ) && this[ i ] === needle ) {
						return i;
					}
				}
				return -1;
			};
		}
		if ( !Array.prototype.forEach ) {
			Array.prototype.forEach = function( callback, context ) {
				var i, len;
				for ( i = 0, len = this.length; i < len; i += 1 ) {
					if ( this.hasOwnProperty( i ) ) {
						callback.call( context, this[ i ], i, this );
					}
				}
			};
		}
		if ( !Array.prototype.map ) {
			Array.prototype.map = function( mapper, context ) {
				var array = this,
					i, len, mapped = [],
					isActuallyString;
				// incredibly, if you do something like
				// Array.prototype.map.call( someString, iterator )
				// then `this` will become an instance of String in IE8.
				// And in IE8, you then can't do string[i]. Facepalm.
				if ( array instanceof String ) {
					array = array.toString();
					isActuallyString = true;
				}
				for ( i = 0, len = array.length; i < len; i += 1 ) {
					if ( array.hasOwnProperty( i ) || isActuallyString ) {
						mapped[ i ] = mapper.call( context, array[ i ], i, array );
					}
				}
				return mapped;
			};
		}
		if ( typeof Array.prototype.reduce !== 'function' ) {
			Array.prototype.reduce = function( callback, opt_initialValue ) {
				var i, value, len, valueIsSet;
				if ( 'function' !== typeof callback ) {
					throw new TypeError( callback + ' is not a function' );
				}
				len = this.length;
				valueIsSet = false;
				if ( arguments.length > 1 ) {
					value = opt_initialValue;
					valueIsSet = true;
				}
				for ( i = 0; i < len; i += 1 ) {
					if ( this.hasOwnProperty( i ) ) {
						if ( valueIsSet ) {
							value = callback( value, this[ i ], i, this );
						}
					} else {
						value = this[ i ];
						valueIsSet = true;
					}
				}
				if ( !valueIsSet ) {
					throw new TypeError( 'Reduce of empty array with no initial value' );
				}
				return value;
			};
		}
		if ( !Array.prototype.filter ) {
			Array.prototype.filter = function( filter, context ) {
				var i, len, filtered = [];
				for ( i = 0, len = this.length; i < len; i += 1 ) {
					if ( this.hasOwnProperty( i ) && filter.call( context, this[ i ], i, this ) ) {
						filtered[ filtered.length ] = this[ i ];
					}
				}
				return filtered;
			};
		}
		if ( typeof Function.prototype.bind !== 'function' ) {
			Function.prototype.bind = function( context ) {
				var args, fn, Empty, bound, slice = [].slice;
				if ( typeof this !== 'function' ) {
					throw new TypeError( 'Function.prototype.bind called on non-function' );
				}
				args = slice.call( arguments, 1 );
				fn = this;
				Empty = function() {};
				bound = function() {
					var ctx = this instanceof Empty && context ? this : context;
					return fn.apply( ctx, args.concat( slice.call( arguments ) ) );
				};
				Empty.prototype = this.prototype;
				bound.prototype = new Empty();
				return bound;
			};
		}
		// https://gist.github.com/Rich-Harris/6010282 via https://gist.github.com/jonathantneal/2869388
		// addEventListener polyfill IE6+
		if ( !win.addEventListener ) {
			( function( win, doc ) {
				var Event, addEventListener, removeEventListener, head, style, origCreateElement;
				Event = function( e, element ) {
					var property, instance = this;
					for ( property in e ) {
						instance[ property ] = e[ property ];
					}
					instance.currentTarget = element;
					instance.target = e.srcElement || element;
					instance.timeStamp = +new Date();
					instance.preventDefault = function() {
						e.returnValue = false;
					};
					instance.stopPropagation = function() {
						e.cancelBubble = true;
					};
				};
				addEventListener = function( type, listener ) {
					var element = this,
						listeners, i;
					listeners = element.listeners || ( element.listeners = [] );
					i = listeners.length;
					listeners[ i ] = [
						listener,
						function( e ) {
							listener.call( element, new Event( e, element ) );
						}
					];
					element.attachEvent( 'on' + type, listeners[ i ][ 1 ] );
				};
				removeEventListener = function( type, listener ) {
					var element = this,
						listeners, i;
					if ( !element.listeners ) {
						return;
					}
					listeners = element.listeners;
					i = listeners.length;
					while ( i-- ) {
						if ( listeners[ i ][ 0 ] === listener ) {
							element.detachEvent( 'on' + type, listeners[ i ][ 1 ] );
						}
					}
				};
				win.addEventListener = doc.addEventListener = addEventListener;
				win.removeEventListener = doc.removeEventListener = removeEventListener;
				if ( 'Element' in win ) {
					Element.prototype.addEventListener = addEventListener;
					Element.prototype.removeEventListener = removeEventListener;
				} else {
					// First, intercept any calls to document.createElement - this is necessary
					// because the CSS hack (see below) doesn't come into play until after a
					// node is added to the DOM, which is too late for a lot of Ractive setup work
					origCreateElement = doc.createElement;
					doc.createElement = function( tagName ) {
						var el = origCreateElement( tagName );
						el.addEventListener = addEventListener;
						el.removeEventListener = removeEventListener;
						return el;
					};
					// Then, mop up any additional elements that weren't created via
					// document.createElement (i.e. with innerHTML).
					head = doc.getElementsByTagName( 'head' )[ 0 ];
					style = doc.createElement( 'style' );
					head.insertBefore( style, head.firstChild );
				}
			}( win, doc ) );
		}
		// The getComputedStyle polyfill interacts badly with jQuery, so we don't attach
		// it to window. Instead, we export it for other modules to use as needed
		// https://github.com/jonathantneal/Polyfills-for-IE8/blob/master/getComputedStyle.js
		if ( !win.getComputedStyle ) {
			exportedShims.getComputedStyle = function() {
				function getPixelSize( element, style, property, fontSize ) {
					var sizeWithSuffix = style[ property ],
						size = parseFloat( sizeWithSuffix ),
						suffix = sizeWithSuffix.split( /\d/ )[ 0 ],
						rootSize;
					fontSize = fontSize != null ? fontSize : /%|em/.test( suffix ) && element.parentElement ? getPixelSize( element.parentElement, element.parentElement.currentStyle, 'fontSize', null ) : 16;
					rootSize = property == 'fontSize' ? fontSize : /width/i.test( property ) ? element.clientWidth : element.clientHeight;
					return suffix == 'em' ? size * fontSize : suffix == 'in' ? size * 96 : suffix == 'pt' ? size * 96 / 72 : suffix == '%' ? size / 100 * rootSize : size;
				}

				function setShortStyleProperty( style, property ) {
					var borderSuffix = property == 'border' ? 'Width' : '',
						t = property + 'Top' + borderSuffix,
						r = property + 'Right' + borderSuffix,
						b = property + 'Bottom' + borderSuffix,
						l = property + 'Left' + borderSuffix;
					style[ property ] = ( style[ t ] == style[ r ] == style[ b ] == style[ l ] ? [ style[ t ] ] : style[ t ] == style[ b ] && style[ l ] == style[ r ] ? [
						style[ t ],
						style[ r ]
					] : style[ l ] == style[ r ] ? [
						style[ t ],
						style[ r ],
						style[ b ]
					] : [
						style[ t ],
						style[ r ],
						style[ b ],
						style[ l ]
					] ).join( ' ' );
				}

				function CSSStyleDeclaration( element ) {
					var currentStyle, style, fontSize, property;
					currentStyle = element.currentStyle;
					style = this;
					fontSize = getPixelSize( element, currentStyle, 'fontSize', null );
					for ( property in currentStyle ) {
						if ( /width|height|margin.|padding.|border.+W/.test( property ) && style[ property ] !== 'auto' ) {
							style[ property ] = getPixelSize( element, currentStyle, property, fontSize ) + 'px';
						} else if ( property === 'styleFloat' ) {
							style.float = currentStyle[ property ];
						} else {
							style[ property ] = currentStyle[ property ];
						}
					}
					setShortStyleProperty( style, 'margin' );
					setShortStyleProperty( style, 'padding' );
					setShortStyleProperty( style, 'border' );
					style.fontSize = fontSize + 'px';
					return style;
				}
				CSSStyleDeclaration.prototype = {
					constructor: CSSStyleDeclaration,
					getPropertyPriority: function() {},
					getPropertyValue: function( prop ) {
						return this[ prop ] || '';
					},
					item: function() {},
					removeProperty: function() {},
					setProperty: function() {},
					getPropertyCSSValue: function() {}
				};

				function getComputedStyle( element ) {
					return new CSSStyleDeclaration( element );
				}
				return getComputedStyle;
			}();
		}
		return exportedShims;
	}();

	var config_initOptions = function() {

		var defaults, initOptions;
		defaults = {
			el: null,
			template: '',
			complete: null,
			preserveWhitespace: false,
			append: false,
			twoway: true,
			modifyArrays: true,
			lazy: false,
			debug: false,
			noIntro: false,
			transitionsEnabled: true,
			magic: false,
			noCssTransform: false,
			adapt: [],
			sanitize: false,
			stripComments: true,
			isolated: false,
			delimiters: [
				'{{',
				'}}'
			],
			tripleDelimiters: [
				'{{{',
				'}}}'
			],
			computed: null
		};
		initOptions = {
			keys: Object.keys( defaults ),
			defaults: defaults
		};
		return initOptions;
	}( legacy );

	var config_svg = function() {

		if ( typeof document === 'undefined' ) {
			return;
		}
		return document && document.implementation.hasFeature( 'http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1' );
	}();

	var config_namespaces = {
		html: 'http://www.w3.org/1999/xhtml',
		mathml: 'http://www.w3.org/1998/Math/MathML',
		svg: 'http://www.w3.org/2000/svg',
		xlink: 'http://www.w3.org/1999/xlink',
		xml: 'http://www.w3.org/XML/1998/namespace',
		xmlns: 'http://www.w3.org/2000/xmlns/'
	};

	var utils_createElement = function( svg, namespaces ) {

		// Test for SVG support
		if ( !svg ) {
			return function( type, ns ) {
				if ( ns && ns !== namespaces.html ) {
					throw 'This browser does not support namespaces other than http://www.w3.org/1999/xhtml. The most likely cause of this error is that you\'re trying to render SVG in an older browser. See http://docs.ractivejs.org/latest/svg-and-older-browsers for more information';
				}
				return document.createElement( type );
			};
		} else {
			return function( type, ns ) {
				if ( !ns || ns === namespaces.html ) {
					return document.createElement( type );
				}
				return document.createElementNS( ns, type );
			};
		}
	}( config_svg, config_namespaces );

	var config_isClient = typeof document === 'object';

	var utils_defineProperty = function( isClient ) {

		try {
			Object.defineProperty( {}, 'test', {
				value: 0
			} );
			if ( isClient ) {
				Object.defineProperty( document.createElement( 'div' ), 'test', {
					value: 0
				} );
			}
			return Object.defineProperty;
		} catch ( err ) {
			// Object.defineProperty doesn't exist, or we're in IE8 where you can
			// only use it with DOM objects (what the fuck were you smoking, MSFT?)
			return function( obj, prop, desc ) {
				obj[ prop ] = desc.value;
			};
		}
	}( config_isClient );

	var utils_defineProperties = function( createElement, defineProperty, isClient ) {

		try {
			try {
				Object.defineProperties( {}, {
					test: {
						value: 0
					}
				} );
			} catch ( err ) {
				// TODO how do we account for this? noMagic = true;
				throw err;
			}
			if ( isClient ) {
				Object.defineProperties( createElement( 'div' ), {
					test: {
						value: 0
					}
				} );
			}
			return Object.defineProperties;
		} catch ( err ) {
			return function( obj, props ) {
				var prop;
				for ( prop in props ) {
					if ( props.hasOwnProperty( prop ) ) {
						defineProperty( obj, prop, props[ prop ] );
					}
				}
			};
		}
	}( utils_createElement, utils_defineProperty, config_isClient );

	var utils_isNumeric = function( thing ) {
		return !isNaN( parseFloat( thing ) ) && isFinite( thing );
	};

	var Ractive_prototype_shared_add = function( isNumeric ) {

		return function( root, keypath, d ) {
			var value;
			if ( typeof keypath !== 'string' || !isNumeric( d ) ) {
				throw new Error( 'Bad arguments' );
			}
			value = +root.get( keypath ) || 0;
			if ( !isNumeric( value ) ) {
				throw new Error( 'Cannot add to a non-numeric value' );
			}
			return root.set( keypath, value + d );
		};
	}( utils_isNumeric );

	var Ractive_prototype_add = function( add ) {

		return function( keypath, d ) {
			return add( this, keypath, d === undefined ? 1 : +d );
		};
	}( Ractive_prototype_shared_add );

	var utils_isEqual = function( a, b ) {
		if ( a === null && b === null ) {
			return true;
		}
		if ( typeof a === 'object' || typeof b === 'object' ) {
			return false;
		}
		return a === b;
	};

	var utils_Promise = function() {

		var Promise, PENDING = {}, FULFILLED = {}, REJECTED = {};
		Promise = function( callback ) {
			var fulfilledHandlers = [],
				rejectedHandlers = [],
				state = PENDING,
				result, dispatchHandlers, makeResolver, fulfil, reject, promise;
			makeResolver = function( newState ) {
				return function( value ) {
					if ( state !== PENDING ) {
						return;
					}
					result = value;
					state = newState;
					dispatchHandlers = makeDispatcher( state === FULFILLED ? fulfilledHandlers : rejectedHandlers, result );
					// dispatch onFulfilled and onRejected handlers asynchronously
					wait( dispatchHandlers );
				};
			};
			fulfil = makeResolver( FULFILLED );
			reject = makeResolver( REJECTED );
			callback( fulfil, reject );
			promise = {
				// `then()` returns a Promise - 2.2.7
				then: function( onFulfilled, onRejected ) {
					var promise2 = new Promise( function( fulfil, reject ) {
						var processResolutionHandler = function( handler, handlers, forward ) {
							// 2.2.1.1
							if ( typeof handler === 'function' ) {
								handlers.push( function( p1result ) {
									var x;
									try {
										x = handler( p1result );
										resolve( promise2, x, fulfil, reject );
									} catch ( err ) {
										reject( err );
									}
								} );
							} else {
								// Forward the result of promise1 to promise2, if resolution handlers
								// are not given
								handlers.push( forward );
							}
						};
						// 2.2
						processResolutionHandler( onFulfilled, fulfilledHandlers, fulfil );
						processResolutionHandler( onRejected, rejectedHandlers, reject );
						if ( state !== PENDING ) {
							// If the promise has resolved already, dispatch the appropriate handlers asynchronously
							wait( dispatchHandlers );
						}
					} );
					return promise2;
				}
			};
			promise[ 'catch' ] = function( onRejected ) {
				return this.then( null, onRejected );
			};
			return promise;
		};
		Promise.all = function( promises ) {
			return new Promise( function( fulfil, reject ) {
				var result = [],
					pending, i, processPromise;
				if ( !promises.length ) {
					fulfil( result );
					return;
				}
				processPromise = function( i ) {
					promises[ i ].then( function( value ) {
						result[ i ] = value;
						if ( !--pending ) {
							fulfil( result );
						}
					}, reject );
				};
				pending = i = promises.length;
				while ( i-- ) {
					processPromise( i );
				}
			} );
		};
		Promise.resolve = function( value ) {
			return new Promise( function( fulfil ) {
				fulfil( value );
			} );
		};
		Promise.reject = function( reason ) {
			return new Promise( function( fulfil, reject ) {
				reject( reason );
			} );
		};
		return Promise;
		// TODO use MutationObservers or something to simulate setImmediate
		function wait( callback ) {
			setTimeout( callback, 0 );
		}

		function makeDispatcher( handlers, result ) {
			return function() {
				var handler;
				while ( handler = handlers.shift() ) {
					handler( result );
				}
			};
		}

		function resolve( promise, x, fulfil, reject ) {
			// Promise Resolution Procedure
			var then;
			// 2.3.1
			if ( x === promise ) {
				throw new TypeError( 'A promise\'s fulfillment handler cannot return the same promise' );
			}
			// 2.3.2
			if ( x instanceof Promise ) {
				x.then( fulfil, reject );
			} else if ( x && ( typeof x === 'object' || typeof x === 'function' ) ) {
				try {
					then = x.then;
				} catch ( e ) {
					reject( e );
					// 2.3.3.2
					return;
				}
				// 2.3.3.3
				if ( typeof then === 'function' ) {
					var called, resolvePromise, rejectPromise;
					resolvePromise = function( y ) {
						if ( called ) {
							return;
						}
						called = true;
						resolve( promise, y, fulfil, reject );
					};
					rejectPromise = function( r ) {
						if ( called ) {
							return;
						}
						called = true;
						reject( r );
					};
					try {
						then.call( x, resolvePromise, rejectPromise );
					} catch ( e ) {
						if ( !called ) {
							// 2.3.3.3.4.1
							reject( e );
							// 2.3.3.3.4.2
							called = true;
							return;
						}
					}
				} else {
					fulfil( x );
				}
			} else {
				fulfil( x );
			}
		}
	}();

	var utils_normaliseKeypath = function() {

		var regex = /\[\s*(\*|[0-9]|[1-9][0-9]+)\s*\]/g;
		return function normaliseKeypath( keypath ) {
			return ( keypath || '' ).replace( regex, '.$1' );
		};
	}();

	var config_vendors = [
		'o',
		'ms',
		'moz',
		'webkit'
	];

	var utils_requestAnimationFrame = function( vendors ) {

		// If window doesn't exist, we don't need requestAnimationFrame
		if ( typeof window === 'undefined' ) {
			return;
		}
		// https://gist.github.com/paulirish/1579671
		( function( vendors, lastTime, window ) {
			var x, setTimeout;
			if ( window.requestAnimationFrame ) {
				return;
			}
			for ( x = 0; x < vendors.length && !window.requestAnimationFrame; ++x ) {
				window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
			}
			if ( !window.requestAnimationFrame ) {
				setTimeout = window.setTimeout;
				window.requestAnimationFrame = function( callback ) {
					var currTime, timeToCall, id;
					currTime = Date.now();
					timeToCall = Math.max( 0, 16 - ( currTime - lastTime ) );
					id = setTimeout( function() {
						callback( currTime + timeToCall );
					}, timeToCall );
					lastTime = currTime + timeToCall;
					return id;
				};
			}
		}( vendors, 0, window ) );
		return window.requestAnimationFrame;
	}( config_vendors );

	var utils_getTime = function() {

		if ( typeof window !== 'undefined' && window.performance && typeof window.performance.now === 'function' ) {
			return function() {
				return window.performance.now();
			};
		} else {
			return function() {
				return Date.now();
			};
		}
	}();

	// This module provides a place to store a) circular dependencies and
	// b) the callback functions that require those circular dependencies
	var circular = [];

	var utils_removeFromArray = function( array, member ) {
		var index = array.indexOf( member );
		if ( index !== -1 ) {
			array.splice( index, 1 );
		}
	};

	var global_css = function( circular, isClient, removeFromArray ) {

		var runloop, styleElement, head, styleSheet, inDom, prefix = '/* Ractive.js component styles */\n',
			componentsInPage = {}, styles = [];
		if ( !isClient ) {
			return;
		}
		circular.push( function() {
			runloop = circular.runloop;
		} );
		styleElement = document.createElement( 'style' );
		styleElement.type = 'text/css';
		head = document.getElementsByTagName( 'head' )[ 0 ];
		inDom = false;
		// Internet Exploder won't let you use styleSheet.innerHTML - we have to
		// use styleSheet.cssText instead
		styleSheet = styleElement.styleSheet;
		return {
			add: function( Component ) {
				if ( !Component.css ) {
					return;
				}
				if ( !componentsInPage[ Component._guid ] ) {
					// we create this counter so that we can in/decrement it as
					// instances are added and removed. When all components are
					// removed, the style is too
					componentsInPage[ Component._guid ] = 0;
					styles.push( Component.css );
					runloop.scheduleCssUpdate();
				}
				componentsInPage[ Component._guid ] += 1;
			},
			remove: function( Component ) {
				if ( !Component.css ) {
					return;
				}
				componentsInPage[ Component._guid ] -= 1;
				if ( !componentsInPage[ Component._guid ] ) {
					removeFromArray( styles, Component.css );
					runloop.scheduleCssUpdate();
				}
			},
			update: function() {
				var css;
				if ( styles.length ) {
					css = prefix + styles.join( ' ' );
					if ( styleSheet ) {
						styleSheet.cssText = css;
					} else {
						styleElement.innerHTML = css;
					}
					if ( !inDom ) {
						head.appendChild( styleElement );
					}
				} else if ( inDom ) {
					head.removeChild( styleElement );
				}
			}
		};
	}( circular, config_isClient, utils_removeFromArray );

	var shared_getValueFromCheckboxes = function( ractive, keypath ) {
		var value, checkboxes, checkbox, len, i, rootEl;
		value = [];
		// TODO in edge cases involving components with inputs bound to the same keypath, this
		// could get messy
		// if we're still in the initial render, we need to find the inputs from the as-yet off-DOM
		// document fragment. otherwise, the root element
		rootEl = ractive._rendering ? ractive.fragment.docFrag : ractive.el;
		checkboxes = rootEl.querySelectorAll( 'input[type="checkbox"][name="{{' + keypath + '}}"]' );
		len = checkboxes.length;
		for ( i = 0; i < len; i += 1 ) {
			checkbox = checkboxes[ i ];
			if ( checkbox.hasAttribute( 'checked' ) || checkbox.checked ) {
				value.push( checkbox._ractive.value );
			}
		}
		return value;
	};

	var utils_hasOwnProperty = Object.prototype.hasOwnProperty;

	var shared_getInnerContext = function( fragment ) {
		do {
			if ( fragment.context ) {
				return fragment.context;
			}
		} while ( fragment = fragment.parent );
		return '';
	};

	var shared_resolveRef = function( circular, normaliseKeypath, hasOwnProperty, getInnerContext ) {

		var get, ancestorErrorMessage = 'Could not resolve reference - too many "../" prefixes';
		circular.push( function() {
			get = circular.get;
		} );
		return function resolveRef( ractive, ref, fragment ) {
			var context, contextKeys, keys, lastKey, postfix, parentKeypath, parentValue, wrapped, hasContextChain;
			ref = normaliseKeypath( ref );
			// Implicit iterators - i.e. {{.}} - are a special case
			if ( ref === '.' ) {
				return getInnerContext( fragment );
			}
			// If a reference begins with '.', it's either a restricted reference or
			// an ancestor reference...
			if ( ref.charAt( 0 ) === '.' ) {
				// ...either way we need to get the innermost context
				context = getInnerContext( fragment );
				contextKeys = context ? context.split( '.' ) : [];
				// ancestor references (starting "../") go up the tree
				if ( ref.substr( 0, 3 ) === '../' ) {
					while ( ref.substr( 0, 3 ) === '../' ) {
						if ( !contextKeys.length ) {
							throw new Error( ancestorErrorMessage );
						}
						contextKeys.pop();
						ref = ref.substring( 3 );
					}
					contextKeys.push( ref );
					return contextKeys.join( '.' );
				}
				// not an ancestor reference - must be a restricted reference (prepended with ".")
				if ( !context ) {
					return ref.substring( 1 );
				}
				return context + ref;
			}
			// Now we need to try and resolve the reference against any
			// contexts set by parent list/object sections
			keys = ref.split( '.' );
			lastKey = keys.pop();
			postfix = keys.length ? '.' + keys.join( '.' ) : '';
			do {
				context = fragment.context;
				if ( !context ) {
					continue;
				}
				hasContextChain = true;
				parentKeypath = context + postfix;
				parentValue = get( ractive, parentKeypath );
				if ( wrapped = ractive._wrapped[ parentKeypath ] ) {
					parentValue = wrapped.get();
				}
				if ( parentValue && ( typeof parentValue === 'object' || typeof parentValue === 'function' ) && lastKey in parentValue ) {
					return context + '.' + ref;
				}
			} while ( fragment = fragment.parent );
			// Still no keypath?
			// If there's no context chain, and the instance is either a) isolated or
			// b) an orphan, then we know that the keypath is identical to the reference
			if ( !hasContextChain && ( !ractive._parent || ractive.isolated ) ) {
				return ref;
			}
			// We need both of these - the first enables components to treat data contexts
			// like lexical scopes in JavaScript functions...
			if ( hasOwnProperty.call( ractive.data, ref ) ) {
				return ref;
			} else if ( get( ractive, ref ) !== undefined ) {
				return ref;
			}
		};
	}( circular, utils_normaliseKeypath, utils_hasOwnProperty, shared_getInnerContext );

	var shared_getUpstreamChanges = function getUpstreamChanges( changes ) {
		var upstreamChanges = [ '' ],
			i, keypath, keys, upstreamKeypath;
		i = changes.length;
		while ( i-- ) {
			keypath = changes[ i ];
			keys = keypath.split( '.' );
			while ( keys.length > 1 ) {
				keys.pop();
				upstreamKeypath = keys.join( '.' );
				if ( upstreamChanges[ upstreamKeypath ] !== true ) {
					upstreamChanges.push( upstreamKeypath );
					upstreamChanges[ upstreamKeypath ] = true;
				}
			}
		}
		return upstreamChanges;
	};

	var shared_notifyDependants = function() {

		var lastKey, starMaps = {};
		lastKey = /[^\.]+$/;

		function notifyDependants( ractive, keypath, onlyDirect ) {
			var i;
			// Notify any pattern observers
			if ( ractive._patternObservers.length ) {
				notifyPatternObservers( ractive, keypath, keypath, onlyDirect, true );
			}
			for ( i = 0; i < ractive._deps.length; i += 1 ) {
				// can't cache ractive._deps.length, it may change
				notifyDependantsAtPriority( ractive, keypath, i, onlyDirect );
			}
		}
		notifyDependants.multiple = function notifyMultipleDependants( ractive, keypaths, onlyDirect ) {
			var i, j, len;
			len = keypaths.length;
			// Notify any pattern observers
			if ( ractive._patternObservers.length ) {
				i = len;
				while ( i-- ) {
					notifyPatternObservers( ractive, keypaths[ i ], keypaths[ i ], onlyDirect, true );
				}
			}
			for ( i = 0; i < ractive._deps.length; i += 1 ) {
				if ( ractive._deps[ i ] ) {
					j = len;
					while ( j-- ) {
						notifyDependantsAtPriority( ractive, keypaths[ j ], i, onlyDirect );
					}
				}
			}
		};
		return notifyDependants;

		function notifyDependantsAtPriority( ractive, keypath, priority, onlyDirect ) {
			var depsByKeypath = ractive._deps[ priority ];
			if ( !depsByKeypath ) {
				return;
			}
			// update dependants of this keypath
			updateAll( depsByKeypath[ keypath ] );
			// If we're only notifying direct dependants, not dependants
			// of downstream keypaths, then YOU SHALL NOT PASS
			if ( onlyDirect ) {
				return;
			}
			// otherwise, cascade
			cascade( ractive._depsMap[ keypath ], ractive, priority );
		}

		function updateAll( deps ) {
			var i, len;
			if ( deps ) {
				len = deps.length;
				for ( i = 0; i < len; i += 1 ) {
					deps[ i ].update();
				}
			}
		}

		function cascade( childDeps, ractive, priority, onlyDirect ) {
			var i;
			if ( childDeps ) {
				i = childDeps.length;
				while ( i-- ) {
					notifyDependantsAtPriority( ractive, childDeps[ i ], priority, onlyDirect );
				}
			}
		}
		// TODO split into two functions? i.e. one for the top-level call, one for the cascade
		function notifyPatternObservers( ractive, registeredKeypath, actualKeypath, isParentOfChangedKeypath, isTopLevelCall ) {
			var i, patternObserver, children, child, key, childActualKeypath, potentialWildcardMatches, cascade;
			// First, observers that match patterns at the same level
			// or higher in the tree
			i = ractive._patternObservers.length;
			while ( i-- ) {
				patternObserver = ractive._patternObservers[ i ];
				if ( patternObserver.regex.test( actualKeypath ) ) {
					patternObserver.update( actualKeypath );
				}
			}
			if ( isParentOfChangedKeypath ) {
				return;
			}
			// If the changed keypath is 'foo.bar', we need to see if there are
			// any pattern observer dependants of keypaths below any of
			// 'foo.bar', 'foo.*', '*.bar' or '*.*' (e.g. 'foo.bar.*' or 'foo.*.baz' )
			cascade = function( keypath ) {
				if ( children = ractive._depsMap[ keypath ] ) {
					i = children.length;
					while ( i-- ) {
						child = children[ i ];
						// foo.*.baz
						key = lastKey.exec( child )[ 0 ];
						// 'baz'
						childActualKeypath = actualKeypath ? actualKeypath + '.' + key : key;
						// 'foo.bar.baz'
						notifyPatternObservers( ractive, child, childActualKeypath );
					}
				}
			};
			if ( isTopLevelCall ) {
				potentialWildcardMatches = getPotentialWildcardMatches( actualKeypath );
				potentialWildcardMatches.forEach( cascade );
			} else {
				cascade( registeredKeypath );
			}
		}
		// This function takes a keypath such as 'foo.bar.baz', and returns
		// all the variants of that keypath that include a wildcard in place
		// of a key, such as 'foo.bar.*', 'foo.*.baz', 'foo.*.*' and so on.
		// These are then checked against the dependants map (ractive._depsMap)
		// to see if any pattern observers are downstream of one or more of
		// these wildcard keypaths (e.g. 'foo.bar.*.status')
		function getPotentialWildcardMatches( keypath ) {
			var keys, starMap, mapper, i, result, wildcardKeypath;
			keys = keypath.split( '.' );
			starMap = getStarMap( keys.length );
			result = [];
			mapper = function( star, i ) {
				return star ? '*' : keys[ i ];
			};
			i = starMap.length;
			while ( i-- ) {
				wildcardKeypath = starMap[ i ].map( mapper ).join( '.' );
				if ( !result[ wildcardKeypath ] ) {
					result.push( wildcardKeypath );
					result[ wildcardKeypath ] = true;
				}
			}
			return result;
		}
		// This function returns all the possible true/false combinations for
		// a given number - e.g. for two, the possible combinations are
		// [ true, true ], [ true, false ], [ false, true ], [ false, false ].
		// It does so by getting all the binary values between 0 and e.g. 11
		function getStarMap( num ) {
			var ones = '',
				max, binary, starMap, mapper, i;
			if ( !starMaps[ num ] ) {
				starMap = [];
				while ( ones.length < num ) {
					ones += 1;
				}
				max = parseInt( ones, 2 );
				mapper = function( digit ) {
					return digit === '1';
				};
				for ( i = 0; i <= max; i += 1 ) {
					binary = i.toString( 2 );
					while ( binary.length < num ) {
						binary = '0' + binary;
					}
					starMap[ i ] = Array.prototype.map.call( binary, mapper );
				}
				starMaps[ num ] = starMap;
			}
			return starMaps[ num ];
		}
	}();

	var shared_makeTransitionManager = function( removeFromArray ) {

		var makeTransitionManager, checkComplete, remove, init;
		makeTransitionManager = function( callback, previous ) {
			var transitionManager = [];
			transitionManager.detachQueue = [];
			transitionManager.remove = remove;
			transitionManager.init = init;
			transitionManager._check = checkComplete;
			transitionManager._callback = callback;
			transitionManager._previous = previous;
			if ( previous ) {
				previous.push( transitionManager );
			}
			return transitionManager;
		};
		checkComplete = function() {
			var element;
			if ( this._ready && !this.length ) {
				while ( element = this.detachQueue.pop() ) {
					element.detach();
				}
				if ( typeof this._callback === 'function' ) {
					this._callback();
				}
				if ( this._previous ) {
					this._previous.remove( this );
				}
			}
		};
		remove = function( transition ) {
			removeFromArray( this, transition );
			this._check();
		};
		init = function() {
			this._ready = true;
			this._check();
		};
		return makeTransitionManager;
	}( utils_removeFromArray );

	var global_runloop = function( circular, css, removeFromArray, getValueFromCheckboxes, resolveRef, getUpstreamChanges, notifyDependants, makeTransitionManager ) {

		circular.push( function() {
			get = circular.get;
			set = circular.set;
		} );
		var runloop, get, set, dirty = false,
			flushing = false,
			pendingCssChanges, inFlight = 0,
			toFocus = null,
			liveQueries = [],
			decorators = [],
			transitions = [],
			observers = [],
			attributes = [],
			activeBindings = [],
			evaluators = [],
			computations = [],
			selectValues = [],
			checkboxKeypaths = {}, checkboxes = [],
			radios = [],
			unresolved = [],
			instances = [],
			transitionManager;
		runloop = {
			start: function( instance, callback ) {
				this.addInstance( instance );
				if ( !flushing ) {
					inFlight += 1;
					// create a new transition manager
					transitionManager = makeTransitionManager( callback, transitionManager );
				}
			},
			end: function() {
				if ( flushing ) {
					attemptKeypathResolution();
					return;
				}
				if ( !--inFlight ) {
					flushing = true;
					flushChanges();
					flushing = false;
					land();
				}
				transitionManager.init();
				transitionManager = transitionManager._previous;
			},
			trigger: function() {
				if ( inFlight || flushing ) {
					attemptKeypathResolution();
					return;
				}
				flushing = true;
				flushChanges();
				flushing = false;
				land();
			},
			focus: function( node ) {
				toFocus = node;
			},
			addInstance: function( instance ) {
				if ( instance && !instances[ instance._guid ] ) {
					instances.push( instance );
					instances[ instances._guid ] = true;
				}
			},
			addLiveQuery: function( query ) {
				liveQueries.push( query );
			},
			addDecorator: function( decorator ) {
				decorators.push( decorator );
			},
			addTransition: function( transition ) {
				transition._manager = transitionManager;
				transitionManager.push( transition );
				transitions.push( transition );
			},
			addObserver: function( observer ) {
				observers.push( observer );
			},
			addAttribute: function( attribute ) {
				attributes.push( attribute );
			},
			addBinding: function( binding ) {
				binding.active = true;
				activeBindings.push( binding );
			},
			scheduleCssUpdate: function() {
				// if runloop isn't currently active, we need to trigger change immediately
				if ( !inFlight && !flushing ) {
					// TODO does this ever happen?
					css.update();
				} else {
					pendingCssChanges = true;
				}
			},
			// changes that may cause additional changes...
			addEvaluator: function( evaluator ) {
				dirty = true;
				evaluators.push( evaluator );
			},
			addComputation: function( thing ) {
				dirty = true;
				computations.push( thing );
			},
			addSelectValue: function( selectValue ) {
				dirty = true;
				selectValues.push( selectValue );
			},
			addCheckbox: function( checkbox ) {
				if ( !checkboxKeypaths[ checkbox.keypath ] ) {
					dirty = true;
					checkboxes.push( checkbox );
				}
			},
			addRadio: function( radio ) {
				dirty = true;
				radios.push( radio );
			},
			addUnresolved: function( thing ) {
				dirty = true;
				unresolved.push( thing );
			},
			removeUnresolved: function( thing ) {
				removeFromArray( unresolved, thing );
			},
			// synchronise node detachments with transition ends
			detachWhenReady: function( thing ) {
				transitionManager.detachQueue.push( thing );
			}
		};
		circular.runloop = runloop;
		return runloop;

		function land() {
			var thing, changedKeypath, changeHash;
			if ( toFocus ) {
				toFocus.focus();
				toFocus = null;
			}
			while ( thing = attributes.pop() ) {
				thing.update().deferred = false;
			}
			while ( thing = liveQueries.pop() ) {
				thing._sort();
			}
			while ( thing = decorators.pop() ) {
				thing.init();
			}
			while ( thing = transitions.pop() ) {
				thing.init();
			}
			while ( thing = observers.pop() ) {
				thing.update();
			}
			while ( thing = activeBindings.pop() ) {
				thing.active = false;
			}
			// Change events are fired last
			while ( thing = instances.pop() ) {
				instances[ thing._guid ] = false;
				if ( thing._changes.length ) {
					changeHash = {};
					while ( changedKeypath = thing._changes.pop() ) {
						changeHash[ changedKeypath ] = get( thing, changedKeypath );
					}
					thing.fire( 'change', changeHash );
				}
			}
			if ( pendingCssChanges ) {
				css.update();
				pendingCssChanges = false;
			}
		}

		function flushChanges() {
			var thing, upstreamChanges, i;
			i = instances.length;
			while ( i-- ) {
				thing = instances[ i ];
				if ( thing._changes.length ) {
					upstreamChanges = getUpstreamChanges( thing._changes );
					notifyDependants.multiple( thing, upstreamChanges, true );
				}
			}
			attemptKeypathResolution();
			while ( dirty ) {
				dirty = false;
				while ( thing = computations.pop() ) {
					thing.update();
				}
				while ( thing = evaluators.pop() ) {
					thing.update().deferred = false;
				}
				while ( thing = selectValues.pop() ) {
					thing.deferredUpdate();
				}
				while ( thing = checkboxes.pop() ) {
					set( thing.root, thing.keypath, getValueFromCheckboxes( thing.root, thing.keypath ) );
				}
				while ( thing = radios.pop() ) {
					thing.update();
				}
			}
		}

		function attemptKeypathResolution() {
			var array, thing, keypath;
			if ( !unresolved.length ) {
				return;
			}
			// see if we can resolve any unresolved references
			array = unresolved.splice( 0, unresolved.length );
			while ( thing = array.pop() ) {
				if ( thing.keypath ) {
					continue;
				}
				keypath = resolveRef( thing.root, thing.ref, thing.parentFragment );
				if ( keypath !== undefined ) {
					// If we've resolved the keypath, we can initialise this item
					thing.resolve( keypath );
				} else {
					// If we can't resolve the reference, try again next time
					unresolved.push( thing );
				}
			}
		}
	}( circular, global_css, utils_removeFromArray, shared_getValueFromCheckboxes, shared_resolveRef, shared_getUpstreamChanges, shared_notifyDependants, shared_makeTransitionManager );

	var shared_animations = function( rAF, getTime, runloop ) {

		var queue = [];
		var animations = {
			tick: function() {
				var i, animation, now;
				now = getTime();
				runloop.start();
				for ( i = 0; i < queue.length; i += 1 ) {
					animation = queue[ i ];
					if ( !animation.tick( now ) ) {
						// animation is complete, remove it from the stack, and decrement i so we don't miss one
						queue.splice( i--, 1 );
					}
				}
				runloop.end();
				if ( queue.length ) {
					rAF( animations.tick );
				} else {
					animations.running = false;
				}
			},
			add: function( animation ) {
				queue.push( animation );
				if ( !animations.running ) {
					animations.running = true;
					rAF( animations.tick );
				}
			},
			// TODO optimise this
			abort: function( keypath, root ) {
				var i = queue.length,
					animation;
				while ( i-- ) {
					animation = queue[ i ];
					if ( animation.root === root && animation.keypath === keypath ) {
						animation.stop();
					}
				}
			}
		};
		return animations;
	}( utils_requestAnimationFrame, utils_getTime, global_runloop );

	var utils_isArray = function() {

		var toString = Object.prototype.toString;
		// thanks, http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
		return function( thing ) {
			return toString.call( thing ) === '[object Array]';
		};
	}();

	var utils_clone = function( isArray ) {

		return function( source ) {
			var target, key;
			if ( !source || typeof source !== 'object' ) {
				return source;
			}
			if ( isArray( source ) ) {
				return source.slice();
			}
			target = {};
			for ( key in source ) {
				if ( source.hasOwnProperty( key ) ) {
					target[ key ] = source[ key ];
				}
			}
			return target;
		};
	}( utils_isArray );

	var registries_adaptors = {};

	var shared_get_arrayAdaptor_getSpliceEquivalent = function( array, methodName, args ) {
		switch ( methodName ) {
			case 'splice':
				return args;
			case 'sort':
			case 'reverse':
				return null;
			case 'pop':
				if ( array.length ) {
					return [ -1 ];
				}
				return null;
			case 'push':
				return [
					array.length,
					0
				].concat( args );
			case 'shift':
				return [
					0,
					1
				];
			case 'unshift':
				return [
					0,
					0
				].concat( args );
		}
	};

	var shared_get_arrayAdaptor_summariseSpliceOperation = function( array, args ) {
		var start, addedItems, removedItems, balance;
		if ( !args ) {
			return null;
		}
		// figure out where the changes started...
		start = +( args[ 0 ] < 0 ? array.length + args[ 0 ] : args[ 0 ] );
		// ...and how many items were added to or removed from the array
		addedItems = Math.max( 0, args.length - 2 );
		removedItems = args[ 1 ] !== undefined ? args[ 1 ] : array.length - start;
		// It's possible to do e.g. [ 1, 2, 3 ].splice( 2, 2 ) - i.e. the second argument
		// means removing more items from the end of the array than there are. In these
		// cases we need to curb JavaScript's enthusiasm or we'll get out of sync
		removedItems = Math.min( removedItems, array.length - start );
		balance = addedItems - removedItems;
		return {
			start: start,
			balance: balance,
			added: addedItems,
			removed: removedItems
		};
	};

	var config_types = {
		TEXT: 1,
		INTERPOLATOR: 2,
		TRIPLE: 3,
		SECTION: 4,
		INVERTED: 5,
		CLOSING: 6,
		ELEMENT: 7,
		PARTIAL: 8,
		COMMENT: 9,
		DELIMCHANGE: 10,
		MUSTACHE: 11,
		TAG: 12,
		ATTRIBUTE: 13,
		COMPONENT: 15,
		NUMBER_LITERAL: 20,
		STRING_LITERAL: 21,
		ARRAY_LITERAL: 22,
		OBJECT_LITERAL: 23,
		BOOLEAN_LITERAL: 24,
		GLOBAL: 26,
		KEY_VALUE_PAIR: 27,
		REFERENCE: 30,
		REFINEMENT: 31,
		MEMBER: 32,
		PREFIX_OPERATOR: 33,
		BRACKETED: 34,
		CONDITIONAL: 35,
		INFIX_OPERATOR: 36,
		INVOCATION: 40
	};

	var shared_clearCache = function clearCache( ractive, keypath, dontTeardownWrapper ) {
		var cacheMap, wrappedProperty;
		if ( !dontTeardownWrapper ) {
			// Is there a wrapped property at this keypath?
			if ( wrappedProperty = ractive._wrapped[ keypath ] ) {
				// Did we unwrap it?
				if ( wrappedProperty.teardown() !== false ) {
					ractive._wrapped[ keypath ] = null;
				}
			}
		}
		ractive._cache[ keypath ] = undefined;
		if ( cacheMap = ractive._cacheMap[ keypath ] ) {
			while ( cacheMap.length ) {
				clearCache( ractive, cacheMap.pop() );
			}
		}
	};

	var utils_createBranch = function() {

		var numeric = /^\s*[0-9]+\s*$/;
		return function( key ) {
			return numeric.test( key ) ? [] : {};
		};
	}();

	var shared_set = function( circular, isEqual, createBranch, clearCache, notifyDependants ) {

		var get;
		circular.push( function() {
			get = circular.get;
		} );

		function set( ractive, keypath, value, silent ) {
			var keys, lastKey, parentKeypath, parentValue, computation, wrapper, evaluator, dontTeardownWrapper;
			if ( isEqual( ractive._cache[ keypath ], value ) ) {
				return;
			}
			computation = ractive._computations[ keypath ];
			wrapper = ractive._wrapped[ keypath ];
			evaluator = ractive._evaluators[ keypath ];
			if ( computation && !computation.setting ) {
				computation.set( value );
			}
			// If we have a wrapper with a `reset()` method, we try and use it. If the
			// `reset()` method returns false, the wrapper should be torn down, and
			// (most likely) a new one should be created later
			if ( wrapper && wrapper.reset ) {
				dontTeardownWrapper = wrapper.reset( value ) !== false;
				if ( dontTeardownWrapper ) {
					value = wrapper.get();
				}
			}
			// Update evaluator value. This may be from the evaluator itself, or
			// it may be from the wrapper that wraps an evaluator's result - it
			// doesn't matter
			if ( evaluator ) {
				evaluator.value = value;
			}
			if ( !computation && !evaluator && !dontTeardownWrapper ) {
				keys = keypath.split( '.' );
				lastKey = keys.pop();
				parentKeypath = keys.join( '.' );
				wrapper = ractive._wrapped[ parentKeypath ];
				if ( wrapper && wrapper.set ) {
					wrapper.set( lastKey, value );
				} else {
					parentValue = wrapper ? wrapper.get() : get( ractive, parentKeypath );
					if ( !parentValue ) {
						parentValue = createBranch( lastKey );
						set( ractive, parentKeypath, parentValue, true );
					}
					parentValue[ lastKey ] = value;
				}
			}
			clearCache( ractive, keypath, dontTeardownWrapper );
			if ( !silent ) {
				ractive._changes.push( keypath );
				notifyDependants( ractive, keypath );
			}
		}
		circular.set = set;
		return set;
	}( circular, utils_isEqual, utils_createBranch, shared_clearCache, shared_notifyDependants );

	var shared_get_arrayAdaptor_processWrapper = function( types, clearCache, notifyDependants, set ) {

		return function( wrapper, array, methodName, spliceSummary ) {
			var root, keypath, clearEnd, updateDependant, i, changed, start, end, childKeypath, lengthUnchanged;
			root = wrapper.root;
			keypath = wrapper.keypath;
			root._changes.push( keypath );
			// If this is a sort or reverse, we just do root.set()...
			// TODO use merge logic?
			if ( methodName === 'sort' || methodName === 'reverse' ) {
				set( root, keypath, array );
				return;
			}
			if ( !spliceSummary ) {
				// (presumably we tried to pop from an array of zero length.
				// in which case there's nothing to do)
				return;
			}
			// ...otherwise we do a smart update whereby elements are added/removed
			// in the right place. But we do need to clear the cache downstream
			clearEnd = !spliceSummary.balance ? spliceSummary.added : array.length - Math.min( spliceSummary.balance, 0 );
			for ( i = spliceSummary.start; i < clearEnd; i += 1 ) {
				clearCache( root, keypath + '.' + i );
			}
			// Propagate changes
			updateDependant = function( dependant ) {
				// is this a DOM section?
				if ( dependant.keypath === keypath && dependant.type === types.SECTION && !dependant.inverted && dependant.docFrag ) {
					dependant.splice( spliceSummary );
				} else {
					dependant.update();
				}
			};
			// Go through all dependant priority levels, finding smart update targets
			root._deps.forEach( function( depsByKeypath ) {
				var dependants = depsByKeypath[ keypath ];
				if ( dependants ) {
					dependants.forEach( updateDependant );
				}
			} );
			// if we're removing old items and adding new ones, simultaneously, we need to force an update
			if ( spliceSummary.added && spliceSummary.removed ) {
				changed = Math.max( spliceSummary.added, spliceSummary.removed );
				start = spliceSummary.start;
				end = start + changed;
				lengthUnchanged = spliceSummary.added === spliceSummary.removed;
				for ( i = start; i < end; i += 1 ) {
					childKeypath = keypath + '.' + i;
					notifyDependants( root, childKeypath );
				}
			}
			// length property has changed - notify dependants
			// TODO in some cases (e.g. todo list example, when marking all as complete, then
			// adding a new item (which should deactivate the 'all complete' checkbox
			// but doesn't) this needs to happen before other updates. But doing so causes
			// other mental problems. not sure what's going on...
			if ( !lengthUnchanged ) {
				clearCache( root, keypath + '.length' );
				notifyDependants( root, keypath + '.length', true );
			}
		};
	}( config_types, shared_clearCache, shared_notifyDependants, shared_set );

	var shared_get_arrayAdaptor_patch = function( runloop, defineProperty, getSpliceEquivalent, summariseSpliceOperation, processWrapper ) {

		var patchedArrayProto = [],
			mutatorMethods = [
				'pop',
				'push',
				'reverse',
				'shift',
				'sort',
				'splice',
				'unshift'
			],
			testObj, patchArrayMethods, unpatchArrayMethods;
		mutatorMethods.forEach( function( methodName ) {
			var method = function() {
				var spliceEquivalent, spliceSummary, result, wrapper, i;
				// push, pop, shift and unshift can all be represented as a splice operation.
				// this makes life easier later
				spliceEquivalent = getSpliceEquivalent( this, methodName, Array.prototype.slice.call( arguments ) );
				spliceSummary = summariseSpliceOperation( this, spliceEquivalent );
				// apply the underlying method
				result = Array.prototype[ methodName ].apply( this, arguments );
				// trigger changes
				this._ractive.setting = true;
				i = this._ractive.wrappers.length;
				while ( i-- ) {
					wrapper = this._ractive.wrappers[ i ];
					runloop.start( wrapper.root );
					processWrapper( wrapper, this, methodName, spliceSummary );
					runloop.end();
				}
				this._ractive.setting = false;
				return result;
			};
			defineProperty( patchedArrayProto, methodName, {
				value: method
			} );
		} );
		// can we use prototype chain injection?
		// http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/#wrappers_prototype_chain_injection
		testObj = {};
		if ( testObj.__proto__ ) {
			// yes, we can
			patchArrayMethods = function( array ) {
				array.__proto__ = patchedArrayProto;
			};
			unpatchArrayMethods = function( array ) {
				array.__proto__ = Array.prototype;
			};
		} else {
			// no, we can't
			patchArrayMethods = function( array ) {
				var i, methodName;
				i = mutatorMethods.length;
				while ( i-- ) {
					methodName = mutatorMethods[ i ];
					defineProperty( array, methodName, {
						value: patchedArrayProto[ methodName ],
						configurable: true
					} );
				}
			};
			unpatchArrayMethods = function( array ) {
				var i;
				i = mutatorMethods.length;
				while ( i-- ) {
					delete array[ mutatorMethods[ i ] ];
				}
			};
		}
		patchArrayMethods.unpatch = unpatchArrayMethods;
		return patchArrayMethods;
	}( global_runloop, utils_defineProperty, shared_get_arrayAdaptor_getSpliceEquivalent, shared_get_arrayAdaptor_summariseSpliceOperation, shared_get_arrayAdaptor_processWrapper );

	var shared_get_arrayAdaptor__arrayAdaptor = function( defineProperty, isArray, patch ) {

		var arrayAdaptor,
			// helpers
			ArrayWrapper, errorMessage;
		arrayAdaptor = {
			filter: function( object ) {
				// wrap the array if a) b) it's an array, and b) either it hasn't been wrapped already,
				// or the array didn't trigger the get() itself
				return isArray( object ) && ( !object._ractive || !object._ractive.setting );
			},
			wrap: function( ractive, array, keypath ) {
				return new ArrayWrapper( ractive, array, keypath );
			}
		};
		ArrayWrapper = function( ractive, array, keypath ) {
			this.root = ractive;
			this.value = array;
			this.keypath = keypath;
			// if this array hasn't already been ractified, ractify it
			if ( !array._ractive ) {
				// define a non-enumerable _ractive property to store the wrappers
				defineProperty( array, '_ractive', {
					value: {
						wrappers: [],
						instances: [],
						setting: false
					},
					configurable: true
				} );
				patch( array );
			}
			// store the ractive instance, so we can handle transitions later
			if ( !array._ractive.instances[ ractive._guid ] ) {
				array._ractive.instances[ ractive._guid ] = 0;
				array._ractive.instances.push( ractive );
			}
			array._ractive.instances[ ractive._guid ] += 1;
			array._ractive.wrappers.push( this );
		};
		ArrayWrapper.prototype = {
			get: function() {
				return this.value;
			},
			teardown: function() {
				var array, storage, wrappers, instances, index;
				array = this.value;
				storage = array._ractive;
				wrappers = storage.wrappers;
				instances = storage.instances;
				// if teardown() was invoked because we're clearing the cache as a result of
				// a change that the array itself triggered, we can save ourselves the teardown
				// and immediate setup
				if ( storage.setting ) {
					return false;
				}
				index = wrappers.indexOf( this );
				if ( index === -1 ) {
					throw new Error( errorMessage );
				}
				wrappers.splice( index, 1 );
				// if nothing else depends on this array, we can revert it to its
				// natural state
				if ( !wrappers.length ) {
					delete array._ractive;
					patch.unpatch( this.value );
				} else {
					// remove ractive instance if possible
					instances[ this.root._guid ] -= 1;
					if ( !instances[ this.root._guid ] ) {
						index = instances.indexOf( this.root );
						if ( index === -1 ) {
							throw new Error( errorMessage );
						}
						instances.splice( index, 1 );
					}
				}
			}
		};
		errorMessage = 'Something went wrong in a rather interesting way';
		return arrayAdaptor;
	}( utils_defineProperty, utils_isArray, shared_get_arrayAdaptor_patch );

	var shared_get_magicAdaptor = function( runloop, createBranch, isArray, clearCache, notifyDependants ) {

		var magicAdaptor, MagicWrapper;
		try {
			Object.defineProperty( {}, 'test', {
				value: 0
			} );
		} catch ( err ) {
			return false;
		}
		magicAdaptor = {
			filter: function( object, keypath, ractive ) {
				var keys, key, parentKeypath, parentWrapper, parentValue;
				if ( !keypath ) {
					return false;
				}
				keys = keypath.split( '.' );
				key = keys.pop();
				parentKeypath = keys.join( '.' );
				// If the parent value is a wrapper, other than a magic wrapper,
				// we shouldn't wrap this property
				if ( ( parentWrapper = ractive._wrapped[ parentKeypath ] ) && !parentWrapper.magic ) {
					return false;
				}
				parentValue = ractive.get( parentKeypath );
				// if parentValue is an array that doesn't include this member,
				// we should return false otherwise lengths will get messed up
				if ( isArray( parentValue ) && /^[0-9]+$/.test( key ) ) {
					return false;
				}
				return parentValue && ( typeof parentValue === 'object' || typeof parentValue === 'function' );
			},
			wrap: function( ractive, property, keypath ) {
				return new MagicWrapper( ractive, property, keypath );
			}
		};
		MagicWrapper = function( ractive, value, keypath ) {
			var keys, objKeypath, descriptor, siblings;
			this.magic = true;
			this.ractive = ractive;
			this.keypath = keypath;
			this.value = value;
			keys = keypath.split( '.' );
			this.prop = keys.pop();
			objKeypath = keys.join( '.' );
			this.obj = objKeypath ? ractive.get( objKeypath ) : ractive.data;
			descriptor = this.originalDescriptor = Object.getOwnPropertyDescriptor( this.obj, this.prop );
			// Has this property already been wrapped?
			if ( descriptor && descriptor.set && ( siblings = descriptor.set._ractiveWrappers ) ) {
				// Yes. Register this wrapper to this property, if it hasn't been already
				if ( siblings.indexOf( this ) === -1 ) {
					siblings.push( this );
				}
				return;
			}
			// No, it hasn't been wrapped
			createAccessors( this, value, descriptor );
		};
		MagicWrapper.prototype = {
			get: function() {
				return this.value;
			},
			reset: function( value ) {
				if ( this.updating ) {
					return;
				}
				this.updating = true;
				this.obj[ this.prop ] = value;
				// trigger set() accessor
				clearCache( this.ractive, this.keypath );
				this.updating = false;
			},
			set: function( key, value ) {
				if ( this.updating ) {
					return;
				}
				if ( !this.obj[ this.prop ] ) {
					this.updating = true;
					this.obj[ this.prop ] = createBranch( key );
					this.updating = false;
				}
				this.obj[ this.prop ][ key ] = value;
			},
			teardown: function() {
				var descriptor, set, value, wrappers, index;
				// If this method was called because the cache was being cleared as a
				// result of a set()/update() call made by this wrapper, we return false
				// so that it doesn't get torn down
				if ( this.updating ) {
					return false;
				}
				descriptor = Object.getOwnPropertyDescriptor( this.obj, this.prop );
				set = descriptor && descriptor.set;
				if ( !set ) {
					// most likely, this was an array member that was spliced out
					return;
				}
				wrappers = set._ractiveWrappers;
				index = wrappers.indexOf( this );
				if ( index !== -1 ) {
					wrappers.splice( index, 1 );
				}
				// Last one out, turn off the lights
				if ( !wrappers.length ) {
					value = this.obj[ this.prop ];
					Object.defineProperty( this.obj, this.prop, this.originalDescriptor || {
						writable: true,
						enumerable: true,
						configurable: true
					} );
					this.obj[ this.prop ] = value;
				}
			}
		};

		function createAccessors( originalWrapper, value, descriptor ) {
			var object, property, oldGet, oldSet, get, set;
			object = originalWrapper.obj;
			property = originalWrapper.prop;
			// Is this descriptor configurable?
			if ( descriptor && !descriptor.configurable ) {
				// Special case - array length
				if ( property === 'length' ) {
					return;
				}
				throw new Error( 'Cannot use magic mode with property "' + property + '" - object is not configurable' );
			}
			// Time to wrap this property
			if ( descriptor ) {
				oldGet = descriptor.get;
				oldSet = descriptor.set;
			}
			get = oldGet || function() {
				return value;
			};
			set = function( v ) {
				if ( oldSet ) {
					oldSet( v );
				}
				value = oldGet ? oldGet() : v;
				set._ractiveWrappers.forEach( updateWrapper );
			};

			function updateWrapper( wrapper ) {
				var keypath, ractive;
				wrapper.value = value;
				if ( wrapper.updating ) {
					return;
				}
				ractive = wrapper.ractive;
				keypath = wrapper.keypath;
				wrapper.updating = true;
				runloop.start( ractive );
				ractive._changes.push( keypath );
				clearCache( ractive, keypath );
				notifyDependants( ractive, keypath );
				runloop.end();
				wrapper.updating = false;
			}
			// Create an array of wrappers, in case other keypaths/ractives depend on this property.
			// Handily, we can store them as a property of the set function. Yay JavaScript.
			set._ractiveWrappers = [ originalWrapper ];
			Object.defineProperty( object, property, {
				get: get,
				set: set,
				enumerable: true,
				configurable: true
			} );
		}
		return magicAdaptor;
	}( global_runloop, utils_createBranch, utils_isArray, shared_clearCache, shared_notifyDependants );

	var shared_get_magicArrayAdaptor = function( magicAdaptor, arrayAdaptor ) {

		if ( !magicAdaptor ) {
			return false;
		}
		var magicArrayAdaptor, MagicArrayWrapper;
		magicArrayAdaptor = {
			filter: function( object, keypath, ractive ) {
				return magicAdaptor.filter( object, keypath, ractive ) && arrayAdaptor.filter( object );
			},
			wrap: function( ractive, array, keypath ) {
				return new MagicArrayWrapper( ractive, array, keypath );
			}
		};
		MagicArrayWrapper = function( ractive, array, keypath ) {
			this.value = array;
			this.magic = true;
			this.magicWrapper = magicAdaptor.wrap( ractive, array, keypath );
			this.arrayWrapper = arrayAdaptor.wrap( ractive, array, keypath );
		};
		MagicArrayWrapper.prototype = {
			get: function() {
				return this.value;
			},
			teardown: function() {
				this.arrayWrapper.teardown();
				this.magicWrapper.teardown();
			},
			reset: function( value ) {
				return this.magicWrapper.reset( value );
			}
		};
		return magicArrayAdaptor;
	}( shared_get_magicAdaptor, shared_get_arrayAdaptor__arrayAdaptor );

	var shared_adaptIfNecessary = function( adaptorRegistry, arrayAdaptor, magicAdaptor, magicArrayAdaptor ) {

		var prefixers = {};
		return function adaptIfNecessary( ractive, keypath, value, isExpressionResult ) {
			var len, i, adaptor, wrapped;
			// Do we have an adaptor for this value?
			len = ractive.adapt.length;
			for ( i = 0; i < len; i += 1 ) {
				adaptor = ractive.adapt[ i ];
				// Adaptors can be specified as e.g. [ 'Backbone.Model', 'Backbone.Collection' ] -
				// we need to get the actual adaptor if that's the case
				if ( typeof adaptor === 'string' ) {
					if ( !adaptorRegistry[ adaptor ] ) {
						throw new Error( 'Missing adaptor "' + adaptor + '"' );
					}
					adaptor = ractive.adapt[ i ] = adaptorRegistry[ adaptor ];
				}
				if ( adaptor.filter( value, keypath, ractive ) ) {
					wrapped = ractive._wrapped[ keypath ] = adaptor.wrap( ractive, value, keypath, getPrefixer( keypath ) );
					wrapped.value = value;
					return value;
				}
			}
			if ( !isExpressionResult ) {
				if ( ractive.magic ) {
					if ( magicArrayAdaptor.filter( value, keypath, ractive ) ) {
						ractive._wrapped[ keypath ] = magicArrayAdaptor.wrap( ractive, value, keypath );
					} else if ( magicAdaptor.filter( value, keypath, ractive ) ) {
						ractive._wrapped[ keypath ] = magicAdaptor.wrap( ractive, value, keypath );
					}
				} else if ( ractive.modifyArrays && arrayAdaptor.filter( value, keypath, ractive ) ) {
					ractive._wrapped[ keypath ] = arrayAdaptor.wrap( ractive, value, keypath );
				}
			}
			return value;
		};

		function prefixKeypath( obj, prefix ) {
			var prefixed = {}, key;
			if ( !prefix ) {
				return obj;
			}
			prefix += '.';
			for ( key in obj ) {
				if ( obj.hasOwnProperty( key ) ) {
					prefixed[ prefix + key ] = obj[ key ];
				}
			}
			return prefixed;
		}

		function getPrefixer( rootKeypath ) {
			var rootDot;
			if ( !prefixers[ rootKeypath ] ) {
				rootDot = rootKeypath ? rootKeypath + '.' : '';
				prefixers[ rootKeypath ] = function( relativeKeypath, value ) {
					var obj;
					if ( typeof relativeKeypath === 'string' ) {
						obj = {};
						obj[ rootDot + relativeKeypath ] = value;
						return obj;
					}
					if ( typeof relativeKeypath === 'object' ) {
						// 'relativeKeypath' is in fact a hash, not a keypath
						return rootDot ? prefixKeypath( relativeKeypath, rootKeypath ) : relativeKeypath;
					}
				};
			}
			return prefixers[ rootKeypath ];
		}
	}( registries_adaptors, shared_get_arrayAdaptor__arrayAdaptor, shared_get_magicAdaptor, shared_get_magicArrayAdaptor );

	var shared_registerDependant = function() {

		return function registerDependant( dependant ) {
			var depsByKeypath, deps, ractive, keypath, priority;
			ractive = dependant.root;
			keypath = dependant.keypath;
			priority = dependant.priority;
			depsByKeypath = ractive._deps[ priority ] || ( ractive._deps[ priority ] = {} );
			deps = depsByKeypath[ keypath ] || ( depsByKeypath[ keypath ] = [] );
			deps.push( dependant );
			dependant.registered = true;
			if ( !keypath ) {
				return;
			}
			updateDependantsMap( ractive, keypath );
		};

		function updateDependantsMap( ractive, keypath ) {
			var keys, parentKeypath, map;
			// update dependants map
			keys = keypath.split( '.' );
			while ( keys.length ) {
				keys.pop();
				parentKeypath = keys.join( '.' );
				map = ractive._depsMap[ parentKeypath ] || ( ractive._depsMap[ parentKeypath ] = [] );
				if ( map[ keypath ] === undefined ) {
					map[ keypath ] = 0;
					map[ map.length ] = keypath;
				}
				map[ keypath ] += 1;
				keypath = parentKeypath;
			}
		}
	}();

	var shared_unregisterDependant = function() {

		return function unregisterDependant( dependant ) {
			var deps, index, ractive, keypath, priority;
			ractive = dependant.root;
			keypath = dependant.keypath;
			priority = dependant.priority;
			deps = ractive._deps[ priority ][ keypath ];
			index = deps.indexOf( dependant );
			if ( index === -1 || !dependant.registered ) {
				throw new Error( 'Attempted to remove a dependant that was no longer registered! This should not happen. If you are seeing this bug in development please raise an issue at https://github.com/RactiveJS/Ractive/issues - thanks' );
			}
			deps.splice( index, 1 );
			dependant.registered = false;
			if ( !keypath ) {
				return;
			}
			updateDependantsMap( ractive, keypath );
		};

		function updateDependantsMap( ractive, keypath ) {
			var keys, parentKeypath, map;
			// update dependants map
			keys = keypath.split( '.' );
			while ( keys.length ) {
				keys.pop();
				parentKeypath = keys.join( '.' );
				map = ractive._depsMap[ parentKeypath ];
				map[ keypath ] -= 1;
				if ( !map[ keypath ] ) {
					// remove from parent deps map
					map.splice( map.indexOf( keypath ), 1 );
					map[ keypath ] = undefined;
				}
				keypath = parentKeypath;
			}
		}
	}();

	var shared_createComponentBinding = function( circular, runloop, isArray, isEqual, registerDependant, unregisterDependant ) {

		var get, set;
		circular.push( function() {
			get = circular.get;
			set = circular.set;
		} );
		var Binding = function( ractive, keypath, otherInstance, otherKeypath, priority ) {
			this.root = ractive;
			this.keypath = keypath;
			this.priority = priority;
			this.otherInstance = otherInstance;
			this.otherKeypath = otherKeypath;
			registerDependant( this );
			this.value = get( this.root, this.keypath );
		};
		Binding.prototype = {
			update: function() {
				var value;
				// Only *you* can prevent infinite loops
				if ( this.updating || this.counterpart && this.counterpart.updating ) {
					return;
				}
				value = get( this.root, this.keypath );
				// Is this a smart array update? If so, it'll update on its
				// own, we shouldn't do anything
				if ( isArray( value ) && value._ractive && value._ractive.setting ) {
					return;
				}
				if ( !isEqual( value, this.value ) ) {
					this.updating = true;
					// TODO maybe the case that `value === this.value` - should that result
					// in an update rather than a set?
					runloop.addInstance( this.otherInstance );
					set( this.otherInstance, this.otherKeypath, value );
					this.value = value;
					// TODO will the counterpart update after this line, during
					// the runloop end cycle? may be a problem...
					this.updating = false;
				}
			},
			reassign: function( newKeypath ) {
				unregisterDependant( this );
				unregisterDependant( this.counterpart );
				this.keypath = newKeypath;
				this.counterpart.otherKeypath = newKeypath;
				registerDependant( this );
				registerDependant( this.counterpart );
			},
			teardown: function() {
				unregisterDependant( this );
			}
		};
		return function createComponentBinding( component, parentInstance, parentKeypath, childKeypath ) {
			var hash, childInstance, bindings, priority, parentToChildBinding, childToParentBinding;
			hash = parentKeypath + '=' + childKeypath;
			bindings = component.bindings;
			if ( bindings[ hash ] ) {
				// TODO does this ever happen?
				return;
			}
			bindings[ hash ] = true;
			childInstance = component.instance;
			priority = component.parentFragment.priority;
			parentToChildBinding = new Binding( parentInstance, parentKeypath, childInstance, childKeypath, priority );
			bindings.push( parentToChildBinding );
			if ( childInstance.twoway ) {
				childToParentBinding = new Binding( childInstance, childKeypath, parentInstance, parentKeypath, 1 );
				bindings.push( childToParentBinding );
				parentToChildBinding.counterpart = childToParentBinding;
				childToParentBinding.counterpart = parentToChildBinding;
			}
		};
	}( circular, global_runloop, utils_isArray, utils_isEqual, shared_registerDependant, shared_unregisterDependant );

	var shared_get_getFromParent = function( circular, createComponentBinding, set ) {

		var get;
		circular.push( function() {
			get = circular.get;
		} );
		return function getFromParent( child, keypath ) {
			var parent, fragment, keypathToTest, value, index;
			parent = child._parent;
			fragment = child.component.parentFragment;
			// Special case - index refs
			if ( fragment.indexRefs && ( index = fragment.indexRefs[ keypath ] ) !== undefined ) {
				// create an index ref binding, so that it can be reassigned letter if necessary
				child.component.indexRefBindings[ keypath ] = keypath;
				return index;
			}
			do {
				if ( !fragment.context ) {
					continue;
				}
				keypathToTest = fragment.context + '.' + keypath;
				value = get( parent, keypathToTest );
				if ( value !== undefined ) {
					createLateComponentBinding( parent, child, keypathToTest, keypath, value );
					return value;
				}
			} while ( fragment = fragment.parent );
			value = get( parent, keypath );
			if ( value !== undefined ) {
				createLateComponentBinding( parent, child, keypath, keypath, value );
				return value;
			}
		};

		function createLateComponentBinding( parent, child, parentKeypath, childKeypath, value ) {
			set( child, childKeypath, value, true );
			createComponentBinding( child.component, parent, parentKeypath, childKeypath );
		}
	}( circular, shared_createComponentBinding, shared_set );

	var shared_get_FAILED_LOOKUP = {
		FAILED_LOOKUP: true
	};

	var shared_get__get = function( circular, hasOwnProperty, clone, adaptIfNecessary, getFromParent, FAILED_LOOKUP ) {

		function get( ractive, keypath, options ) {
			var cache = ractive._cache,
				value, computation, wrapped, evaluator;
			if ( cache[ keypath ] === undefined ) {
				// Is this a computed property?
				if ( computation = ractive._computations[ keypath ] ) {
					value = computation.value;
				} else if ( wrapped = ractive._wrapped[ keypath ] ) {
					value = wrapped.value;
				} else if ( !keypath ) {
					adaptIfNecessary( ractive, '', ractive.data );
					value = ractive.data;
				} else if ( evaluator = ractive._evaluators[ keypath ] ) {
					value = evaluator.value;
				} else {
					value = retrieve( ractive, keypath );
				}
				cache[ keypath ] = value;
			} else {
				value = cache[ keypath ];
			}
			// If the property doesn't exist on this viewmodel, we
			// can try going up a scope. This will create bindings
			// between parent and child if possible
			if ( value === FAILED_LOOKUP ) {
				if ( ractive._parent && !ractive.isolated ) {
					value = getFromParent( ractive, keypath, options );
				} else {
					value = undefined;
				}
			}
			if ( options && options.evaluateWrapped && ( wrapped = ractive._wrapped[ keypath ] ) ) {
				value = wrapped.get();
			}
			return value;
		}
		circular.get = get;
		return get;

		function retrieve( ractive, keypath ) {
			var keys, key, parentKeypath, parentValue, cacheMap, value, wrapped, shouldClone;
			keys = keypath.split( '.' );
			key = keys.pop();
			parentKeypath = keys.join( '.' );
			parentValue = get( ractive, parentKeypath );
			if ( wrapped = ractive._wrapped[ parentKeypath ] ) {
				parentValue = wrapped.get();
			}
			if ( parentValue === null || parentValue === undefined ) {
				return;
			}
			// update cache map
			if ( !( cacheMap = ractive._cacheMap[ parentKeypath ] ) ) {
				ractive._cacheMap[ parentKeypath ] = [ keypath ];
			} else {
				if ( cacheMap.indexOf( keypath ) === -1 ) {
					cacheMap.push( keypath );
				}
			}
			// If this property doesn't exist, we return a sentinel value
			// so that we know to query parent scope (if such there be)
			if ( typeof parentValue === 'object' && !( key in parentValue ) ) {
				return ractive._cache[ keypath ] = FAILED_LOOKUP;
			}
			// If this value actually lives on the prototype of this
			// instance's `data`, and not as an own property, we need to
			// clone it. Otherwise the instance could end up manipulating
			// data that doesn't belong to it
			shouldClone = !hasOwnProperty.call( parentValue, key );
			value = shouldClone ? clone( parentValue[ key ] ) : parentValue[ key ];
			// Do we have an adaptor for this value?
			value = adaptIfNecessary( ractive, keypath, value, false );
			// Update cache
			ractive._cache[ keypath ] = value;
			return value;
		}
	}( circular, utils_hasOwnProperty, utils_clone, shared_adaptIfNecessary, shared_get_getFromParent, shared_get_FAILED_LOOKUP );

	/* global console */
	var utils_warn = function() {

		if ( typeof console !== 'undefined' && typeof console.warn === 'function' && typeof console.warn.apply === 'function' ) {
			return function() {
				console.warn.apply( console, arguments );
			};
		}
		return function() {};
	}();

	var utils_isObject = function() {

		var toString = Object.prototype.toString;
		return function( thing ) {
			return typeof thing === 'object' && toString.call( thing ) === '[object Object]';
		};
	}();

	var registries_interpolators = function( circular, hasOwnProperty, isArray, isObject, isNumeric ) {

		var interpolators, interpolate, cssLengthPattern;
		circular.push( function() {
			interpolate = circular.interpolate;
		} );
		cssLengthPattern = /^([+-]?[0-9]+\.?(?:[0-9]+)?)(px|em|ex|%|in|cm|mm|pt|pc)$/;
		interpolators = {
			number: function( from, to ) {
				var delta;
				if ( !isNumeric( from ) || !isNumeric( to ) ) {
					return null;
				}
				from = +from;
				to = +to;
				delta = to - from;
				if ( !delta ) {
					return function() {
						return from;
					};
				}
				return function( t ) {
					return from + t * delta;
				};
			},
			array: function( from, to ) {
				var intermediate, interpolators, len, i;
				if ( !isArray( from ) || !isArray( to ) ) {
					return null;
				}
				intermediate = [];
				interpolators = [];
				i = len = Math.min( from.length, to.length );
				while ( i-- ) {
					interpolators[ i ] = interpolate( from[ i ], to[ i ] );
				}
				// surplus values - don't interpolate, but don't exclude them either
				for ( i = len; i < from.length; i += 1 ) {
					intermediate[ i ] = from[ i ];
				}
				for ( i = len; i < to.length; i += 1 ) {
					intermediate[ i ] = to[ i ];
				}
				return function( t ) {
					var i = len;
					while ( i-- ) {
						intermediate[ i ] = interpolators[ i ]( t );
					}
					return intermediate;
				};
			},
			object: function( from, to ) {
				var properties, len, interpolators, intermediate, prop;
				if ( !isObject( from ) || !isObject( to ) ) {
					return null;
				}
				properties = [];
				intermediate = {};
				interpolators = {};
				for ( prop in from ) {
					if ( hasOwnProperty.call( from, prop ) ) {
						if ( hasOwnProperty.call( to, prop ) ) {
							properties.push( prop );
							interpolators[ prop ] = interpolate( from[ prop ], to[ prop ] );
						} else {
							intermediate[ prop ] = from[ prop ];
						}
					}
				}
				for ( prop in to ) {
					if ( hasOwnProperty.call( to, prop ) && !hasOwnProperty.call( from, prop ) ) {
						intermediate[ prop ] = to[ prop ];
					}
				}
				len = properties.length;
				return function( t ) {
					var i = len,
						prop;
					while ( i-- ) {
						prop = properties[ i ];
						intermediate[ prop ] = interpolators[ prop ]( t );
					}
					return intermediate;
				};
			},
			cssLength: function( from, to ) {
				var fromMatch, toMatch, fromUnit, toUnit, fromValue, toValue, unit, delta;
				if ( from !== 0 && typeof from !== 'string' || to !== 0 && typeof to !== 'string' ) {
					return null;
				}
				fromMatch = cssLengthPattern.exec( from );
				toMatch = cssLengthPattern.exec( to );
				fromUnit = fromMatch ? fromMatch[ 2 ] : '';
				toUnit = toMatch ? toMatch[ 2 ] : '';
				if ( fromUnit && toUnit && fromUnit !== toUnit ) {
					return null;
				}
				unit = fromUnit || toUnit;
				fromValue = fromMatch ? +fromMatch[ 1 ] : 0;
				toValue = toMatch ? +toMatch[ 1 ] : 0;
				delta = toValue - fromValue;
				if ( !delta ) {
					return function() {
						return fromValue + unit;
					};
				}
				return function( t ) {
					return fromValue + t * delta + unit;
				};
			}
		};
		return interpolators;
	}( circular, utils_hasOwnProperty, utils_isArray, utils_isObject, utils_isNumeric );

	var shared_interpolate = function( circular, warn, interpolators ) {

		var interpolate = function( from, to, ractive, type ) {
			if ( from === to ) {
				return snap( to );
			}
			if ( type ) {
				if ( ractive.interpolators[ type ] ) {
					return ractive.interpolators[ type ]( from, to ) || snap( to );
				}
				warn( 'Missing "' + type + '" interpolator. You may need to download a plugin from [TODO]' );
			}
			return interpolators.number( from, to ) || interpolators.array( from, to ) || interpolators.object( from, to ) || interpolators.cssLength( from, to ) || snap( to );
		};
		circular.interpolate = interpolate;
		return interpolate;

		function snap( to ) {
			return function() {
				return to;
			};
		}
	}( circular, utils_warn, registries_interpolators );

	var Ractive_prototype_animate_Animation = function( warn, runloop, interpolate, set ) {

		var Animation = function( options ) {
			var key;
			this.startTime = Date.now();
			// from and to
			for ( key in options ) {
				if ( options.hasOwnProperty( key ) ) {
					this[ key ] = options[ key ];
				}
			}
			this.interpolator = interpolate( this.from, this.to, this.root, this.interpolator );
			this.running = true;
		};
		Animation.prototype = {
			tick: function() {
				var elapsed, t, value, timeNow, index, keypath;
				keypath = this.keypath;
				if ( this.running ) {
					timeNow = Date.now();
					elapsed = timeNow - this.startTime;
					if ( elapsed >= this.duration ) {
						if ( keypath !== null ) {
							runloop.start( this.root );
							set( this.root, keypath, this.to );
							runloop.end();
						}
						if ( this.step ) {
							this.step( 1, this.to );
						}
						this.complete( this.to );
						index = this.root._animations.indexOf( this );
						// TODO investigate why this happens
						if ( index === -1 ) {
							warn( 'Animation was not found' );
						}
						this.root._animations.splice( index, 1 );
						this.running = false;
						return false;
					}
					t = this.easing ? this.easing( elapsed / this.duration ) : elapsed / this.duration;
					if ( keypath !== null ) {
						value = this.interpolator( t );
						runloop.start( this.root );
						set( this.root, keypath, value );
						runloop.end();
					}
					if ( this.step ) {
						this.step( t, value );
					}
					return true;
				}
				return false;
			},
			stop: function() {
				var index;
				this.running = false;
				index = this.root._animations.indexOf( this );
				// TODO investigate why this happens
				if ( index === -1 ) {
					warn( 'Animation was not found' );
				}
				this.root._animations.splice( index, 1 );
			}
		};
		return Animation;
	}( utils_warn, global_runloop, shared_interpolate, shared_set );

	var Ractive_prototype_animate__animate = function( isEqual, Promise, normaliseKeypath, animations, get, Animation ) {

		var noop = function() {}, noAnimation = {
				stop: noop
			};
		return function( keypath, to, options ) {
			var promise, fulfilPromise, k, animation, animations, easing, duration, step, complete, makeValueCollector, currentValues, collectValue, dummy, dummyOptions;
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			// animate multiple keypaths
			if ( typeof keypath === 'object' ) {
				options = to || {};
				easing = options.easing;
				duration = options.duration;
				animations = [];
				// we don't want to pass the `step` and `complete` handlers, as they will
				// run for each animation! So instead we'll store the handlers and create
				// our own...
				step = options.step;
				complete = options.complete;
				if ( step || complete ) {
					currentValues = {};
					options.step = null;
					options.complete = null;
					makeValueCollector = function( keypath ) {
						return function( t, value ) {
							currentValues[ keypath ] = value;
						};
					};
				}
				for ( k in keypath ) {
					if ( keypath.hasOwnProperty( k ) ) {
						if ( step || complete ) {
							collectValue = makeValueCollector( k );
							options = {
								easing: easing,
								duration: duration
							};
							if ( step ) {
								options.step = collectValue;
							}
						}
						options.complete = complete ? collectValue : noop;
						animations.push( animate( this, k, keypath[ k ], options ) );
					}
				}
				if ( step || complete ) {
					dummyOptions = {
						easing: easing,
						duration: duration
					};
					if ( step ) {
						dummyOptions.step = function( t ) {
							step( t, currentValues );
						};
					}
					if ( complete ) {
						promise.then( function( t ) {
							complete( t, currentValues );
						} );
					}
					dummyOptions.complete = fulfilPromise;
					dummy = animate( this, null, null, dummyOptions );
					animations.push( dummy );
				}
				return {
					stop: function() {
						var animation;
						while ( animation = animations.pop() ) {
							animation.stop();
						}
						if ( dummy ) {
							dummy.stop();
						}
					}
				};
			}
			// animate a single keypath
			options = options || {};
			if ( options.complete ) {
				promise.then( options.complete );
			}
			options.complete = fulfilPromise;
			animation = animate( this, keypath, to, options );
			promise.stop = function() {
				animation.stop();
			};
			return promise;
		};

		function animate( root, keypath, to, options ) {
			var easing, duration, animation, from;
			if ( keypath ) {
				keypath = normaliseKeypath( keypath );
			}
			if ( keypath !== null ) {
				from = get( root, keypath );
			}
			// cancel any existing animation
			// TODO what about upstream/downstream keypaths?
			animations.abort( keypath, root );
			// don't bother animating values that stay the same
			if ( isEqual( from, to ) ) {
				if ( options.complete ) {
					options.complete( options.to );
				}
				return noAnimation;
			}
			// easing function
			if ( options.easing ) {
				if ( typeof options.easing === 'function' ) {
					easing = options.easing;
				} else {
					easing = root.easing[ options.easing ];
				}
				if ( typeof easing !== 'function' ) {
					easing = null;
				}
			}
			// duration
			duration = options.duration === undefined ? 400 : options.duration;
			// TODO store keys, use an internal set method
			animation = new Animation( {
				keypath: keypath,
				from: from,
				to: to,
				root: root,
				duration: duration,
				easing: easing,
				interpolator: options.interpolator,
				// TODO wrap callbacks if necessary, to use instance as context
				step: options.step,
				complete: options.complete
			} );
			animations.add( animation );
			root._animations.push( animation );
			return animation;
		}
	}( utils_isEqual, utils_Promise, utils_normaliseKeypath, shared_animations, shared_get__get, Ractive_prototype_animate_Animation );

	var Ractive_prototype_detach = function() {
		return this.fragment.detach();
	};

	var Ractive_prototype_find = function( selector ) {
		if ( !this.el ) {
			return null;
		}
		return this.fragment.find( selector );
	};

	var utils_matches = function( isClient, vendors, createElement ) {

		var div, methodNames, unprefixed, prefixed, i, j, makeFunction;
		if ( !isClient ) {
			return;
		}
		div = createElement( 'div' );
		methodNames = [
			'matches',
			'matchesSelector'
		];
		makeFunction = function( methodName ) {
			return function( node, selector ) {
				return node[ methodName ]( selector );
			};
		};
		i = methodNames.length;
		while ( i-- ) {
			unprefixed = methodNames[ i ];
			if ( div[ unprefixed ] ) {
				return makeFunction( unprefixed );
			}
			j = vendors.length;
			while ( j-- ) {
				prefixed = vendors[ i ] + unprefixed.substr( 0, 1 ).toUpperCase() + unprefixed.substring( 1 );
				if ( div[ prefixed ] ) {
					return makeFunction( prefixed );
				}
			}
		}
		// IE8...
		return function( node, selector ) {
			var nodes, i;
			nodes = ( node.parentNode || node.document ).querySelectorAll( selector );
			i = nodes.length;
			while ( i-- ) {
				if ( nodes[ i ] === node ) {
					return true;
				}
			}
			return false;
		};
	}( config_isClient, config_vendors, utils_createElement );

	var Ractive_prototype_shared_makeQuery_test = function( matches ) {

		return function( item, noDirty ) {
			var itemMatches = this._isComponentQuery ? !this.selector || item.name === this.selector : matches( item.node, this.selector );
			if ( itemMatches ) {
				this.push( item.node || item.instance );
				if ( !noDirty ) {
					this._makeDirty();
				}
				return true;
			}
		};
	}( utils_matches );

	var Ractive_prototype_shared_makeQuery_cancel = function() {
		var liveQueries, selector, index;
		liveQueries = this._root[ this._isComponentQuery ? 'liveComponentQueries' : 'liveQueries' ];
		selector = this.selector;
		index = liveQueries.indexOf( selector );
		if ( index !== -1 ) {
			liveQueries.splice( index, 1 );
			liveQueries[ selector ] = null;
		}
	};

	var Ractive_prototype_shared_makeQuery_sortByItemPosition = function() {

		return function( a, b ) {
			var ancestryA, ancestryB, oldestA, oldestB, mutualAncestor, indexA, indexB, fragments, fragmentA, fragmentB;
			ancestryA = getAncestry( a.component || a._ractive.proxy );
			ancestryB = getAncestry( b.component || b._ractive.proxy );
			oldestA = ancestryA[ ancestryA.length - 1 ];
			oldestB = ancestryB[ ancestryB.length - 1 ];
			// remove items from the end of both ancestries as long as they are identical
			// - the final one removed is the closest mutual ancestor
			while ( oldestA && oldestA === oldestB ) {
				ancestryA.pop();
				ancestryB.pop();
				mutualAncestor = oldestA;
				oldestA = ancestryA[ ancestryA.length - 1 ];
				oldestB = ancestryB[ ancestryB.length - 1 ];
			}
			// now that we have the mutual ancestor, we can find which is earliest
			oldestA = oldestA.component || oldestA;
			oldestB = oldestB.component || oldestB;
			fragmentA = oldestA.parentFragment;
			fragmentB = oldestB.parentFragment;
			// if both items share a parent fragment, our job is easy
			if ( fragmentA === fragmentB ) {
				indexA = fragmentA.items.indexOf( oldestA );
				indexB = fragmentB.items.indexOf( oldestB );
				// if it's the same index, it means one contains the other,
				// so we see which has the longest ancestry
				return indexA - indexB || ancestryA.length - ancestryB.length;
			}
			// if mutual ancestor is a section, we first test to see which section
			// fragment comes first
			if ( fragments = mutualAncestor.fragments ) {
				indexA = fragments.indexOf( fragmentA );
				indexB = fragments.indexOf( fragmentB );
				return indexA - indexB || ancestryA.length - ancestryB.length;
			}
			throw new Error( 'An unexpected condition was met while comparing the position of two components. Please file an issue at https://github.com/RactiveJS/Ractive/issues - thanks!' );
		};

		function getParent( item ) {
			var parentFragment;
			if ( parentFragment = item.parentFragment ) {
				return parentFragment.owner;
			}
			if ( item.component && ( parentFragment = item.component.parentFragment ) ) {
				return parentFragment.owner;
			}
		}

		function getAncestry( item ) {
			var ancestry, ancestor;
			ancestry = [ item ];
			ancestor = getParent( item );
			while ( ancestor ) {
				ancestry.push( ancestor );
				ancestor = getParent( ancestor );
			}
			return ancestry;
		}
	}();

	var Ractive_prototype_shared_makeQuery_sortByDocumentPosition = function( sortByItemPosition ) {

		return function( node, otherNode ) {
			var bitmask;
			if ( node.compareDocumentPosition ) {
				bitmask = node.compareDocumentPosition( otherNode );
				return bitmask & 2 ? 1 : -1;
			}
			// In old IE, we can piggy back on the mechanism for
			// comparing component positions
			return sortByItemPosition( node, otherNode );
		};
	}( Ractive_prototype_shared_makeQuery_sortByItemPosition );

	var Ractive_prototype_shared_makeQuery_sort = function( sortByDocumentPosition, sortByItemPosition ) {

		return function() {
			this.sort( this._isComponentQuery ? sortByItemPosition : sortByDocumentPosition );
			this._dirty = false;
		};
	}( Ractive_prototype_shared_makeQuery_sortByDocumentPosition, Ractive_prototype_shared_makeQuery_sortByItemPosition );

	var Ractive_prototype_shared_makeQuery_dirty = function( runloop ) {

		return function() {
			if ( !this._dirty ) {
				runloop.addLiveQuery( this );
				this._dirty = true;
			}
		};
	}( global_runloop );

	var Ractive_prototype_shared_makeQuery_remove = function( nodeOrComponent ) {
		var index = this.indexOf( this._isComponentQuery ? nodeOrComponent.instance : nodeOrComponent );
		if ( index !== -1 ) {
			this.splice( index, 1 );
		}
	};

	var Ractive_prototype_shared_makeQuery__makeQuery = function( defineProperties, test, cancel, sort, dirty, remove ) {

		return function( ractive, selector, live, isComponentQuery ) {
			var query = [];
			defineProperties( query, {
				selector: {
					value: selector
				},
				live: {
					value: live
				},
				_isComponentQuery: {
					value: isComponentQuery
				},
				_test: {
					value: test
				}
			} );
			if ( !live ) {
				return query;
			}
			defineProperties( query, {
				cancel: {
					value: cancel
				},
				_root: {
					value: ractive
				},
				_sort: {
					value: sort
				},
				_makeDirty: {
					value: dirty
				},
				_remove: {
					value: remove
				},
				_dirty: {
					value: false,
					writable: true
				}
			} );
			return query;
		};
	}( utils_defineProperties, Ractive_prototype_shared_makeQuery_test, Ractive_prototype_shared_makeQuery_cancel, Ractive_prototype_shared_makeQuery_sort, Ractive_prototype_shared_makeQuery_dirty, Ractive_prototype_shared_makeQuery_remove );

	var Ractive_prototype_findAll = function( makeQuery ) {

		return function( selector, options ) {
			var liveQueries, query;
			if ( !this.el ) {
				return [];
			}
			options = options || {};
			liveQueries = this._liveQueries;
			// Shortcut: if we're maintaining a live query with this
			// selector, we don't need to traverse the parallel DOM
			if ( query = liveQueries[ selector ] ) {
				// Either return the exact same query, or (if not live) a snapshot
				return options && options.live ? query : query.slice();
			}
			query = makeQuery( this, selector, !! options.live, false );
			// Add this to the list of live queries Ractive needs to maintain,
			// if applicable
			if ( query.live ) {
				liveQueries.push( selector );
				liveQueries[ selector ] = query;
			}
			this.fragment.findAll( selector, query );
			return query;
		};
	}( Ractive_prototype_shared_makeQuery__makeQuery );

	var Ractive_prototype_findAllComponents = function( makeQuery ) {

		return function( selector, options ) {
			var liveQueries, query;
			options = options || {};
			liveQueries = this._liveComponentQueries;
			// Shortcut: if we're maintaining a live query with this
			// selector, we don't need to traverse the parallel DOM
			if ( query = liveQueries[ selector ] ) {
				// Either return the exact same query, or (if not live) a snapshot
				return options && options.live ? query : query.slice();
			}
			query = makeQuery( this, selector, !! options.live, true );
			// Add this to the list of live queries Ractive needs to maintain,
			// if applicable
			if ( query.live ) {
				liveQueries.push( selector );
				liveQueries[ selector ] = query;
			}
			this.fragment.findAllComponents( selector, query );
			return query;
		};
	}( Ractive_prototype_shared_makeQuery__makeQuery );

	var Ractive_prototype_findComponent = function( selector ) {
		return this.fragment.findComponent( selector );
	};

	var Ractive_prototype_fire = function( eventName ) {
		var args, i, len, subscribers = this._subs[ eventName ];
		if ( !subscribers ) {
			return;
		}
		args = Array.prototype.slice.call( arguments, 1 );
		for ( i = 0, len = subscribers.length; i < len; i += 1 ) {
			subscribers[ i ].apply( this, args );
		}
	};

	var shared_get_UnresolvedImplicitDependency = function( circular, removeFromArray, runloop, notifyDependants ) {

		var get, empty = {};
		circular.push( function() {
			get = circular.get;
		} );
		var UnresolvedImplicitDependency = function( ractive, keypath ) {
			this.root = ractive;
			this.ref = keypath;
			this.parentFragment = empty;
			ractive._unresolvedImplicitDependencies[ keypath ] = true;
			ractive._unresolvedImplicitDependencies.push( this );
			runloop.addUnresolved( this );
		};
		UnresolvedImplicitDependency.prototype = {
			resolve: function() {
				var ractive = this.root;
				notifyDependants( ractive, this.ref );
				ractive._unresolvedImplicitDependencies[ this.ref ] = false;
				removeFromArray( ractive._unresolvedImplicitDependencies, this );
			},
			teardown: function() {
				runloop.removeUnresolved( this );
			}
		};
		return UnresolvedImplicitDependency;
	}( circular, utils_removeFromArray, global_runloop, shared_notifyDependants );

	var Ractive_prototype_get = function( normaliseKeypath, get, UnresolvedImplicitDependency ) {

		var options = {
			isTopLevel: true
		};
		return function Ractive_prototype_get( keypath ) {
			var value;
			keypath = normaliseKeypath( keypath );
			value = get( this, keypath, options );
			// capture the dependency, if we're inside an evaluator
			if ( this._captured && this._captured[ keypath ] !== true ) {
				this._captured.push( keypath );
				this._captured[ keypath ] = true;
				// if we couldn't resolve the keypath, we need to make it as a failed
				// lookup, so that the evaluator updates correctly once we CAN
				// resolve the keypath
				if ( value === undefined && this._unresolvedImplicitDependencies[ keypath ] !== true ) {
					new UnresolvedImplicitDependency( this, keypath );
				}
			}
			return value;
		};
	}( utils_normaliseKeypath, shared_get__get, shared_get_UnresolvedImplicitDependency );

	var utils_getElement = function( input ) {
		var output;
		if ( typeof window === 'undefined' || !document || !input ) {
			return null;
		}
		// We already have a DOM node - no work to do. (Duck typing alert!)
		if ( input.nodeType ) {
			return input;
		}
		// Get node from string
		if ( typeof input === 'string' ) {
			// try ID first
			output = document.getElementById( input );
			// then as selector, if possible
			if ( !output && document.querySelector ) {
				output = document.querySelector( input );
			}
			// did it work?
			if ( output && output.nodeType ) {
				return output;
			}
		}
		// If we've been given a collection (jQuery, Zepto etc), extract the first item
		if ( input[ 0 ] && input[ 0 ].nodeType ) {
			return input[ 0 ];
		}
		return null;
	};

	var Ractive_prototype_insert = function( getElement ) {

		return function( target, anchor ) {
			target = getElement( target );
			anchor = getElement( anchor ) || null;
			if ( !target ) {
				throw new Error( 'You must specify a valid target to insert into' );
			}
			target.insertBefore( this.detach(), anchor );
			this.fragment.pNode = this.el = target;
		};
	}( utils_getElement );

	var Ractive_prototype_merge_mapOldToNewIndex = function( oldArray, newArray ) {
		var usedIndices, firstUnusedIndex, newIndices, changed;
		usedIndices = {};
		firstUnusedIndex = 0;
		newIndices = oldArray.map( function( item, i ) {
			var index, start, len;
			start = firstUnusedIndex;
			len = newArray.length;
			do {
				index = newArray.indexOf( item, start );
				if ( index === -1 ) {
					changed = true;
					return -1;
				}
				start = index + 1;
			} while ( usedIndices[ index ] && start < len );
			// keep track of the first unused index, so we don't search
			// the whole of newArray for each item in oldArray unnecessarily
			if ( index === firstUnusedIndex ) {
				firstUnusedIndex += 1;
			}
			if ( index !== i ) {
				changed = true;
			}
			usedIndices[ index ] = true;
			return index;
		} );
		newIndices.unchanged = !changed;
		return newIndices;
	};

	var Ractive_prototype_merge_propagateChanges = function( types, notifyDependants ) {

		return function( ractive, keypath, newIndices, lengthUnchanged ) {
			var updateDependant;
			ractive._changes.push( keypath );
			updateDependant = function( dependant ) {
				// references need to get processed before mustaches
				if ( dependant.type === types.REFERENCE ) {
					dependant.update();
				} else if ( dependant.keypath === keypath && dependant.type === types.SECTION && !dependant.inverted && dependant.docFrag ) {
					dependant.merge( newIndices );
				} else {
					dependant.update();
				}
			};
			// Go through all dependant priority levels, finding merge targets
			ractive._deps.forEach( function( depsByKeypath ) {
				var dependants = depsByKeypath[ keypath ];
				if ( dependants ) {
					dependants.forEach( updateDependant );
				}
			} );
			// length property has changed - notify dependants
			// TODO in some cases (e.g. todo list example, when marking all as complete, then
			// adding a new item (which should deactivate the 'all complete' checkbox
			// but doesn't) this needs to happen before other updates. But doing so causes
			// other mental problems. not sure what's going on...
			if ( !lengthUnchanged ) {
				notifyDependants( ractive, keypath + '.length', true );
			}
		};
	}( config_types, shared_notifyDependants );

	var Ractive_prototype_merge__merge = function( runloop, warn, isArray, Promise, set, mapOldToNewIndex, propagateChanges ) {

		var comparators = {};
		return function merge( keypath, array, options ) {
			var currentArray, oldArray, newArray, comparator, lengthUnchanged, newIndices, promise, fulfilPromise;
			currentArray = this.get( keypath );
			// If either the existing value or the new value isn't an
			// array, just do a regular set
			if ( !isArray( currentArray ) || !isArray( array ) ) {
				return this.set( keypath, array, options && options.complete );
			}
			lengthUnchanged = currentArray.length === array.length;
			if ( options && options.compare ) {
				comparator = getComparatorFunction( options.compare );
				try {
					oldArray = currentArray.map( comparator );
					newArray = array.map( comparator );
				} catch ( err ) {
					// fallback to an identity check - worst case scenario we have
					// to do more DOM manipulation than we thought...
					// ...unless we're in debug mode of course
					if ( this.debug ) {
						throw err;
					} else {
						warn( 'Merge operation: comparison failed. Falling back to identity checking' );
					}
					oldArray = currentArray;
					newArray = array;
				}
			} else {
				oldArray = currentArray;
				newArray = array;
			}
			// find new indices for members of oldArray
			newIndices = mapOldToNewIndex( oldArray, newArray );
			// Manage transitions
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			runloop.start( this, fulfilPromise );
			// Update the model
			// TODO allow existing array to be updated in place, rather than replaced?
			set( this, keypath, array, true );
			propagateChanges( this, keypath, newIndices, lengthUnchanged );
			runloop.end();
			// attach callback as fulfilment handler, if specified
			if ( options && options.complete ) {
				promise.then( options.complete );
			}
			return promise;
		};

		function stringify( item ) {
			return JSON.stringify( item );
		}

		function getComparatorFunction( comparator ) {
			// If `compare` is `true`, we use JSON.stringify to compare
			// objects that are the same shape, but non-identical - i.e.
			// { foo: 'bar' } !== { foo: 'bar' }
			if ( comparator === true ) {
				return stringify;
			}
			if ( typeof comparator === 'string' ) {
				if ( !comparators[ comparator ] ) {
					comparators[ comparator ] = function( item ) {
						return item[ comparator ];
					};
				}
				return comparators[ comparator ];
			}
			if ( typeof comparator === 'function' ) {
				return comparator;
			}
			throw new Error( 'The `compare` option must be a function, or a string representing an identifying field (or `true` to use JSON.stringify)' );
		}
	}( global_runloop, utils_warn, utils_isArray, utils_Promise, shared_set, Ractive_prototype_merge_mapOldToNewIndex, Ractive_prototype_merge_propagateChanges );

	var Ractive_prototype_observe_Observer = function( runloop, isEqual, get ) {

		var Observer = function( ractive, keypath, callback, options ) {
			var self = this;
			this.root = ractive;
			this.keypath = keypath;
			this.callback = callback;
			this.defer = options.defer;
			this.debug = options.debug;
			this.proxy = {
				update: function() {
					self.reallyUpdate();
				}
			};
			// Observers are notified before any DOM changes take place (though
			// they can defer execution until afterwards)
			this.priority = 0;
			// default to root as context, but allow it to be overridden
			this.context = options && options.context ? options.context : ractive;
		};
		Observer.prototype = {
			init: function( immediate ) {
				if ( immediate !== false ) {
					this.update();
				} else {
					this.value = get( this.root, this.keypath );
				}
			},
			update: function() {
				if ( this.defer && this.ready ) {
					runloop.addObserver( this.proxy );
					return;
				}
				this.reallyUpdate();
			},
			reallyUpdate: function() {
				var oldValue, newValue;
				oldValue = this.value;
				newValue = get( this.root, this.keypath );
				this.value = newValue;
				// Prevent infinite loops
				if ( this.updating ) {
					return;
				}
				this.updating = true;
				if ( !isEqual( newValue, oldValue ) || !this.ready ) {
					// wrap the callback in a try-catch block, and only throw error in
					// debug mode
					try {
						this.callback.call( this.context, newValue, oldValue, this.keypath );
					} catch ( err ) {
						if ( this.debug || this.root.debug ) {
							throw err;
						}
					}
				}
				this.updating = false;
			}
		};
		return Observer;
	}( global_runloop, utils_isEqual, shared_get__get );

	var Ractive_prototype_observe_getPattern = function( isArray ) {

		return function( ractive, pattern ) {
			var keys, key, values, toGet, newToGet, expand, concatenate;
			keys = pattern.split( '.' );
			toGet = [];
			expand = function( keypath ) {
				var value, key;
				value = ractive._wrapped[ keypath ] ? ractive._wrapped[ keypath ].get() : ractive.get( keypath );
				for ( key in value ) {
					if ( value.hasOwnProperty( key ) && ( key !== '_ractive' || !isArray( value ) ) ) {
						// for benefit of IE8
						newToGet.push( keypath + '.' + key );
					}
				}
			};
			concatenate = function( keypath ) {
				return keypath + '.' + key;
			};
			while ( key = keys.shift() ) {
				if ( key === '*' ) {
					newToGet = [];
					toGet.forEach( expand );
					toGet = newToGet;
				} else {
					if ( !toGet[ 0 ] ) {
						toGet[ 0 ] = key;
					} else {
						toGet = toGet.map( concatenate );
					}
				}
			}
			values = {};
			toGet.forEach( function( keypath ) {
				values[ keypath ] = ractive.get( keypath );
			} );
			return values;
		};
	}( utils_isArray );

	var Ractive_prototype_observe_PatternObserver = function( runloop, isEqual, get, getPattern ) {

		var PatternObserver, wildcard = /\*/;
		PatternObserver = function( ractive, keypath, callback, options ) {
			this.root = ractive;
			this.callback = callback;
			this.defer = options.defer;
			this.debug = options.debug;
			this.keypath = keypath;
			this.regex = new RegExp( '^' + keypath.replace( /\./g, '\\.' ).replace( /\*/g, '[^\\.]+' ) + '$' );
			this.values = {};
			if ( this.defer ) {
				this.proxies = [];
			}
			// Observers are notified before any DOM changes take place (though
			// they can defer execution until afterwards)
			this.priority = 'pattern';
			// default to root as context, but allow it to be overridden
			this.context = options && options.context ? options.context : ractive;
		};
		PatternObserver.prototype = {
			init: function( immediate ) {
				var values, keypath;
				values = getPattern( this.root, this.keypath );
				if ( immediate !== false ) {
					for ( keypath in values ) {
						if ( values.hasOwnProperty( keypath ) ) {
							this.update( keypath );
						}
					}
				} else {
					this.values = values;
				}
			},
			update: function( keypath ) {
				var values;
				if ( wildcard.test( keypath ) ) {
					values = getPattern( this.root, keypath );
					for ( keypath in values ) {
						if ( values.hasOwnProperty( keypath ) ) {
							this.update( keypath );
						}
					}
					return;
				}
				if ( this.defer && this.ready ) {
					runloop.addObserver( this.getProxy( keypath ) );
					return;
				}
				this.reallyUpdate( keypath );
			},
			reallyUpdate: function( keypath ) {
				var value = get( this.root, keypath );
				// Prevent infinite loops
				if ( this.updating ) {
					this.values[ keypath ] = value;
					return;
				}
				this.updating = true;
				if ( !isEqual( value, this.values[ keypath ] ) || !this.ready ) {
					// wrap the callback in a try-catch block, and only throw error in
					// debug mode
					try {
						this.callback.call( this.context, value, this.values[ keypath ], keypath );
					} catch ( err ) {
						if ( this.debug || this.root.debug ) {
							throw err;
						}
					}
					this.values[ keypath ] = value;
				}
				this.updating = false;
			},
			getProxy: function( keypath ) {
				var self = this;
				if ( !this.proxies[ keypath ] ) {
					this.proxies[ keypath ] = {
						update: function() {
							self.reallyUpdate( keypath );
						}
					};
				}
				return this.proxies[ keypath ];
			}
		};
		return PatternObserver;
	}( global_runloop, utils_isEqual, shared_get__get, Ractive_prototype_observe_getPattern );

	var Ractive_prototype_observe_getObserverFacade = function( normaliseKeypath, registerDependant, unregisterDependant, Observer, PatternObserver ) {

		var wildcard = /\*/,
			emptyObject = {};
		return function getObserverFacade( ractive, keypath, callback, options ) {
			var observer, isPatternObserver;
			keypath = normaliseKeypath( keypath );
			options = options || emptyObject;
			// pattern observers are treated differently
			if ( wildcard.test( keypath ) ) {
				observer = new PatternObserver( ractive, keypath, callback, options );
				ractive._patternObservers.push( observer );
				isPatternObserver = true;
			} else {
				observer = new Observer( ractive, keypath, callback, options );
			}
			registerDependant( observer );
			observer.init( options.init );
			// This flag allows observers to initialise even with undefined values
			observer.ready = true;
			return {
				cancel: function() {
					var index;
					if ( isPatternObserver ) {
						index = ractive._patternObservers.indexOf( observer );
						if ( index !== -1 ) {
							ractive._patternObservers.splice( index, 1 );
						}
					}
					unregisterDependant( observer );
				}
			};
		};
	}( utils_normaliseKeypath, shared_registerDependant, shared_unregisterDependant, Ractive_prototype_observe_Observer, Ractive_prototype_observe_PatternObserver );

	var Ractive_prototype_observe__observe = function( isObject, getObserverFacade ) {

		return function observe( keypath, callback, options ) {
			var observers, map, keypaths, i;
			// Allow a map of keypaths to handlers
			if ( isObject( keypath ) ) {
				options = callback;
				map = keypath;
				observers = [];
				for ( keypath in map ) {
					if ( map.hasOwnProperty( keypath ) ) {
						callback = map[ keypath ];
						observers.push( this.observe( keypath, callback, options ) );
					}
				}
				return {
					cancel: function() {
						while ( observers.length ) {
							observers.pop().cancel();
						}
					}
				};
			}
			// Allow `ractive.observe( callback )` - i.e. observe entire model
			if ( typeof keypath === 'function' ) {
				options = callback;
				callback = keypath;
				keypath = '';
				return getObserverFacade( this, keypath, callback, options );
			}
			keypaths = keypath.split( ' ' );
			// Single keypath
			if ( keypaths.length === 1 ) {
				return getObserverFacade( this, keypath, callback, options );
			}
			// Multiple space-separated keypaths
			observers = [];
			i = keypaths.length;
			while ( i-- ) {
				keypath = keypaths[ i ];
				if ( keypath ) {
					observers.push( getObserverFacade( this, keypath, callback, options ) );
				}
			}
			return {
				cancel: function() {
					while ( observers.length ) {
						observers.pop().cancel();
					}
				}
			};
		};
	}( utils_isObject, Ractive_prototype_observe_getObserverFacade );

	var Ractive_prototype_off = function( eventName, callback ) {
		var subscribers, index;
		// if no callback specified, remove all callbacks
		if ( !callback ) {
			// if no event name specified, remove all callbacks for all events
			if ( !eventName ) {
				// TODO use this code instead, once the following issue has been resolved
				// in PhantomJS (tests are unpassable otherwise!)
				// https://github.com/ariya/phantomjs/issues/11856
				// defineProperty( this, '_subs', { value: create( null ), configurable: true });
				for ( eventName in this._subs ) {
					delete this._subs[ eventName ];
				}
			} else {
				this._subs[ eventName ] = [];
			}
		}
		subscribers = this._subs[ eventName ];
		if ( subscribers ) {
			index = subscribers.indexOf( callback );
			if ( index !== -1 ) {
				subscribers.splice( index, 1 );
			}
		}
	};

	var Ractive_prototype_on = function( eventName, callback ) {
		var self = this,
			listeners, n;
		// allow mutliple listeners to be bound in one go
		if ( typeof eventName === 'object' ) {
			listeners = [];
			for ( n in eventName ) {
				if ( eventName.hasOwnProperty( n ) ) {
					listeners.push( this.on( n, eventName[ n ] ) );
				}
			}
			return {
				cancel: function() {
					var listener;
					while ( listener = listeners.pop() ) {
						listener.cancel();
					}
				}
			};
		}
		if ( !this._subs[ eventName ] ) {
			this._subs[ eventName ] = [ callback ];
		} else {
			this._subs[ eventName ].push( callback );
		}
		return {
			cancel: function() {
				self.off( eventName, callback );
			}
		};
	};

	var utils_create = function() {

		var create;
		try {
			Object.create( null );
			create = Object.create;
		} catch ( err ) {
			// sigh
			create = function() {
				var F = function() {};
				return function( proto, props ) {
					var obj;
					if ( proto === null ) {
						return {};
					}
					F.prototype = proto;
					obj = new F();
					if ( props ) {
						Object.defineProperties( obj, props );
					}
					return obj;
				};
			}();
		}
		return create;
	}();

	var render_shared_Fragment_initialise = function( types, create ) {

		return function initFragment( fragment, options ) {
			var numItems, i, parentFragment, parentRefs, ref;
			// The item that owns this fragment - an element, section, partial, or attribute
			fragment.owner = options.owner;
			parentFragment = fragment.parent = fragment.owner.parentFragment;
			// inherited properties
			fragment.root = options.root;
			fragment.pNode = options.pNode;
			fragment.pElement = options.pElement;
			fragment.context = options.context;
			// If parent item is a section, this may not be the only fragment
			// that belongs to it - we need to make a note of the index
			if ( fragment.owner.type === types.SECTION ) {
				fragment.index = options.index;
			}
			// index references (the 'i' in {{#section:i}}<!-- -->{{/section}}) need to cascade
			// down the tree
			if ( parentFragment ) {
				parentRefs = parentFragment.indexRefs;
				if ( parentRefs ) {
					fragment.indexRefs = create( null );
					// avoids need for hasOwnProperty
					for ( ref in parentRefs ) {
						fragment.indexRefs[ ref ] = parentRefs[ ref ];
					}
				}
			}
			// inherit priority
			fragment.priority = parentFragment ? parentFragment.priority + 1 : 1;
			if ( options.indexRef ) {
				if ( !fragment.indexRefs ) {
					fragment.indexRefs = {};
				}
				fragment.indexRefs[ options.indexRef ] = options.index;
			}
			// Time to create this fragment's child items;
			fragment.items = [];
			numItems = options.descriptor ? options.descriptor.length : 0;
			for ( i = 0; i < numItems; i += 1 ) {
				fragment.items[ fragment.items.length ] = fragment.createItem( {
					parentFragment: fragment,
					pElement: options.pElement,
					descriptor: options.descriptor[ i ],
					index: i
				} );
			}
		};
	}( config_types, utils_create );

	var render_shared_utils_startsWithKeypath = function startsWithKeypath( target, keypath ) {
		return target.substr( 0, keypath.length + 1 ) === keypath + '.';
	};

	var render_shared_utils_startsWith = function( startsWithKeypath ) {

		return function startsWith( target, keypath ) {
			return target === keypath || startsWithKeypath( target, keypath );
		};
	}( render_shared_utils_startsWithKeypath );

	var render_shared_utils_getNewKeypath = function( startsWithKeypath ) {

		return function getNewKeypath( targetKeypath, oldKeypath, newKeypath ) {
			//exact match
			if ( targetKeypath === oldKeypath ) {
				return newKeypath;
			}
			//partial match based on leading keypath segments
			if ( startsWithKeypath( targetKeypath, oldKeypath ) ) {
				return targetKeypath.replace( oldKeypath + '.', newKeypath + '.' );
			}
		};
	}( render_shared_utils_startsWithKeypath );

	var render_shared_utils_assignNewKeypath = function( startsWith, getNewKeypath ) {

		return function assignNewKeypath( target, property, oldKeypath, newKeypath ) {
			if ( !target[ property ] || startsWith( target[ property ], newKeypath ) ) {
				return;
			}
			target[ property ] = getNewKeypath( target[ property ], oldKeypath, newKeypath );
		};
	}( render_shared_utils_startsWith, render_shared_utils_getNewKeypath );

	var render_shared_Fragment_reassign = function( assignNewKeypath ) {

		return function reassignFragment( indexRef, newIndex, oldKeypath, newKeypath ) {
			// If this fragment was rendered with innerHTML, we have nothing to do
			// TODO a less hacky way of determining this
			if ( this.html !== undefined ) {
				return;
			}
			// assign new context keypath if needed
			assignNewKeypath( this, 'context', oldKeypath, newKeypath );
			if ( this.indexRefs && this.indexRefs[ indexRef ] !== undefined && this.indexRefs[ indexRef ] !== newIndex ) {
				this.indexRefs[ indexRef ] = newIndex;
			}
			this.items.forEach( function( item ) {
				item.reassign( indexRef, newIndex, oldKeypath, newKeypath );
			} );
		};
	}( render_shared_utils_assignNewKeypath );

	var render_shared_Fragment__Fragment = function( init, reassign ) {

		return {
			init: init,
			reassign: reassign
		};
	}( render_shared_Fragment_initialise, render_shared_Fragment_reassign );

	var render_DomFragment_shared_insertHtml = function( namespaces, createElement ) {

		var elementCache = {}, ieBug, ieBlacklist;
		try {
			createElement( 'table' ).innerHTML = 'foo';
		} catch ( err ) {
			ieBug = true;
			ieBlacklist = {
				TABLE: [
					'<table class="x">',
					'</table>'
				],
				THEAD: [
					'<table><thead class="x">',
					'</thead></table>'
				],
				TBODY: [
					'<table><tbody class="x">',
					'</tbody></table>'
				],
				TR: [
					'<table><tr class="x">',
					'</tr></table>'
				],
				SELECT: [
					'<select class="x">',
					'</select>'
				]
			};
		}
		return function( html, tagName, namespace, docFrag ) {
			var container, nodes = [],
				wrapper;
			if ( html ) {
				if ( ieBug && ( wrapper = ieBlacklist[ tagName ] ) ) {
					container = element( 'DIV' );
					container.innerHTML = wrapper[ 0 ] + html + wrapper[ 1 ];
					container = container.querySelector( '.x' );
				} else if ( namespace === namespaces.svg ) {
					container = element( 'DIV' );
					container.innerHTML = '<svg class="x">' + html + '</svg>';
					container = container.querySelector( '.x' );
				} else {
					container = element( tagName );
					container.innerHTML = html;
				}
				while ( container.firstChild ) {
					nodes.push( container.firstChild );
					docFrag.appendChild( container.firstChild );
				}
			}
			return nodes;
		};

		function element( tagName ) {
			return elementCache[ tagName ] || ( elementCache[ tagName ] = createElement( tagName ) );
		}
	}( config_namespaces, utils_createElement );

	var render_DomFragment_shared_detach = function() {
		var node = this.node,
			parentNode;
		if ( node && ( parentNode = node.parentNode ) ) {
			parentNode.removeChild( node );
			return node;
		}
	};

	var render_DomFragment_Text = function( types, detach ) {

		var DomText, lessThan, greaterThan;
		lessThan = /</g;
		greaterThan = />/g;
		DomText = function( options, docFrag ) {
			this.type = types.TEXT;
			this.descriptor = options.descriptor;
			if ( docFrag ) {
				this.node = document.createTextNode( options.descriptor );
				docFrag.appendChild( this.node );
			}
		};
		DomText.prototype = {
			detach: detach,
			reassign: function() {},
			//no-op
			teardown: function( destroy ) {
				if ( destroy ) {
					this.detach();
				}
			},
			firstNode: function() {
				return this.node;
			},
			toString: function() {
				return ( '' + this.descriptor ).replace( lessThan, '&lt;' ).replace( greaterThan, '&gt;' );
			}
		};
		return DomText;
	}( config_types, render_DomFragment_shared_detach );

	var shared_teardown = function( runloop, unregisterDependant ) {

		return function( thing ) {
			if ( !thing.keypath ) {
				// this was on the 'unresolved' list, we need to remove it
				runloop.removeUnresolved( thing );
			} else {
				// this was registered as a dependant
				unregisterDependant( thing );
			}
		};
	}( global_runloop, shared_unregisterDependant );

	var shared_Unresolved = function( runloop ) {

		var Unresolved = function( ractive, ref, parentFragment, callback ) {
			this.root = ractive;
			this.ref = ref;
			this.parentFragment = parentFragment;
			this.resolve = callback;
			runloop.addUnresolved( this );
		};
		Unresolved.prototype = {
			teardown: function() {
				runloop.removeUnresolved( this );
			}
		};
		return Unresolved;
	}( global_runloop );

	var render_shared_Evaluator_Reference = function( types, isEqual, defineProperty, registerDependant, unregisterDependant ) {

		var Reference, thisPattern;
		thisPattern = /this/;
		Reference = function( root, keypath, evaluator, argNum, priority ) {
			var value;
			this.evaluator = evaluator;
			this.keypath = keypath;
			this.root = root;
			this.argNum = argNum;
			this.type = types.REFERENCE;
			this.priority = priority;
			value = root.get( keypath );
			if ( typeof value === 'function' ) {
				value = wrapFunction( value, root, evaluator );
			}
			this.value = evaluator.values[ argNum ] = value;
			registerDependant( this );
		};
		Reference.prototype = {
			update: function() {
				var value = this.root.get( this.keypath );
				if ( typeof value === 'function' && !value._nowrap ) {
					value = wrapFunction( value, this.root, this.evaluator );
				}
				if ( !isEqual( value, this.value ) ) {
					this.evaluator.values[ this.argNum ] = value;
					this.evaluator.bubble();
					this.value = value;
				}
			},
			teardown: function() {
				unregisterDependant( this );
			}
		};
		return Reference;

		function wrapFunction( fn, ractive, evaluator ) {
			var prop, evaluators, index;
			// If the function doesn't refer to `this`, we don't need
			// to set the context, because we're not doing `this.get()`
			// (which is how dependencies are tracked)
			if ( !thisPattern.test( fn.toString() ) ) {
				defineProperty( fn, '_nowrap', {
					// no point doing this every time
					value: true
				} );
				return fn;
			}
			// If this function is being wrapped for the first time...
			if ( !fn[ '_' + ractive._guid ] ) {
				// ...we need to do some work
				defineProperty( fn, '_' + ractive._guid, {
					value: function() {
						var originalCaptured, result, i, evaluator;
						originalCaptured = ractive._captured;
						if ( !originalCaptured ) {
							ractive._captured = [];
						}
						result = fn.apply( ractive, arguments );
						if ( ractive._captured.length ) {
							i = evaluators.length;
							while ( i-- ) {
								evaluator = evaluators[ i ];
								evaluator.updateSoftDependencies( ractive._captured );
							}
						}
						// reset
						ractive._captured = originalCaptured;
						return result;
					},
					writable: true
				} );
				for ( prop in fn ) {
					if ( fn.hasOwnProperty( prop ) ) {
						fn[ '_' + ractive._guid ][ prop ] = fn[ prop ];
					}
				}
				fn[ '_' + ractive._guid + '_evaluators' ] = [];
			}
			// We need to make a note of which evaluators are using this function,
			// so that they can all be notified of changes
			evaluators = fn[ '_' + ractive._guid + '_evaluators' ];
			index = evaluators.indexOf( evaluator );
			if ( index === -1 ) {
				evaluators.push( evaluator );
			}
			// Return the wrapped function
			return fn[ '_' + ractive._guid ];
		}
	}( config_types, utils_isEqual, utils_defineProperty, shared_registerDependant, shared_unregisterDependant );

	var render_shared_Evaluator_SoftReference = function( isEqual, registerDependant, unregisterDependant ) {

		var SoftReference = function( root, keypath, evaluator ) {
			this.root = root;
			this.keypath = keypath;
			this.priority = evaluator.priority;
			this.evaluator = evaluator;
			registerDependant( this );
		};
		SoftReference.prototype = {
			update: function() {
				var value = this.root.get( this.keypath );
				if ( !isEqual( value, this.value ) ) {
					this.evaluator.bubble();
					this.value = value;
				}
			},
			teardown: function() {
				unregisterDependant( this );
			}
		};
		return SoftReference;
	}( utils_isEqual, shared_registerDependant, shared_unregisterDependant );

	var render_shared_Evaluator__Evaluator = function( runloop, warn, isEqual, clearCache, notifyDependants, adaptIfNecessary, Reference, SoftReference ) {

		var Evaluator, cache = {};
		Evaluator = function( root, keypath, uniqueString, functionStr, args, priority ) {
			var evaluator = this;
			evaluator.root = root;
			evaluator.uniqueString = uniqueString;
			evaluator.keypath = keypath;
			evaluator.priority = priority;
			evaluator.fn = getFunctionFromString( functionStr, args.length );
			evaluator.values = [];
			evaluator.refs = [];
			args.forEach( function( arg, i ) {
				if ( !arg ) {
					return;
				}
				if ( arg.indexRef ) {
					// this is an index ref... we don't need to register a dependant
					evaluator.values[ i ] = arg.value;
				} else {
					evaluator.refs.push( new Reference( root, arg.keypath, evaluator, i, priority ) );
				}
			} );
			evaluator.selfUpdating = evaluator.refs.length <= 1;
		};
		Evaluator.prototype = {
			bubble: function() {
				// If we only have one reference, we can update immediately...
				if ( this.selfUpdating ) {
					this.update();
				} else if ( !this.deferred ) {
					runloop.addEvaluator( this );
					this.deferred = true;
				}
			},
			update: function() {
				var value;
				// prevent infinite loops
				if ( this.evaluating ) {
					return this;
				}
				this.evaluating = true;
				try {
					value = this.fn.apply( null, this.values );
				} catch ( err ) {
					if ( this.root.debug ) {
						warn( 'Error evaluating "' + this.uniqueString + '": ' + err.message || err );
					}
					value = undefined;
				}
				if ( !isEqual( value, this.value ) ) {
					this.value = value;
					clearCache( this.root, this.keypath );
					adaptIfNecessary( this.root, this.keypath, value, true );
					notifyDependants( this.root, this.keypath );
				}
				this.evaluating = false;
				return this;
			},
			// TODO should evaluators ever get torn down? At present, they don't...
			teardown: function() {
				while ( this.refs.length ) {
					this.refs.pop().teardown();
				}
				clearCache( this.root, this.keypath );
				this.root._evaluators[ this.keypath ] = null;
			},
			// This method forces the evaluator to sync with the current model
			// in the case of a smart update
			refresh: function() {
				if ( !this.selfUpdating ) {
					this.deferred = true;
				}
				var i = this.refs.length;
				while ( i-- ) {
					this.refs[ i ].update();
				}
				if ( this.deferred ) {
					this.update();
					this.deferred = false;
				}
			},
			updateSoftDependencies: function( softDeps ) {
				var i, keypath, ref;
				if ( !this.softRefs ) {
					this.softRefs = [];
				}
				// teardown any references that are no longer relevant
				i = this.softRefs.length;
				while ( i-- ) {
					ref = this.softRefs[ i ];
					if ( !softDeps[ ref.keypath ] ) {
						this.softRefs.splice( i, 1 );
						this.softRefs[ ref.keypath ] = false;
						ref.teardown();
					}
				}
				// add references for any new soft dependencies
				i = softDeps.length;
				while ( i-- ) {
					keypath = softDeps[ i ];
					if ( !this.softRefs[ keypath ] ) {
						ref = new SoftReference( this.root, keypath, this );
						this.softRefs.push( ref );
						this.softRefs[ keypath ] = true;
					}
				}
				this.selfUpdating = this.refs.length + this.softRefs.length <= 1;
			}
		};
		return Evaluator;

		function getFunctionFromString( str, i ) {
			var fn, args;
			str = str.replace( /\$\{([0-9]+)\}/g, '_$1' );
			if ( cache[ str ] ) {
				return cache[ str ];
			}
			args = [];
			while ( i-- ) {
				args[ i ] = '_' + i;
			}
			fn = new Function( args.join( ',' ), 'return(' + str + ')' );
			cache[ str ] = fn;
			return fn;
		}
	}( global_runloop, utils_warn, utils_isEqual, shared_clearCache, shared_notifyDependants, shared_adaptIfNecessary, render_shared_Evaluator_Reference, render_shared_Evaluator_SoftReference );

	var render_shared_Resolvers_ExpressionResolver = function( removeFromArray, resolveRef, Unresolved, Evaluator, getNewKeypath ) {

		var ExpressionResolver = function( owner, parentFragment, expression, callback ) {
			var expressionResolver = this,
				ractive, indexRefs, args;
			ractive = owner.root;
			this.root = ractive;
			this.callback = callback;
			this.owner = owner;
			this.str = expression.s;
			this.args = args = [];
			this.unresolved = [];
			this.pending = 0;
			indexRefs = parentFragment.indexRefs;
			// some expressions don't have references. edge case, but, yeah.
			if ( !expression.r || !expression.r.length ) {
				this.resolved = this.ready = true;
				this.bubble();
				return;
			}
			// Create resolvers for each reference
			expression.r.forEach( function( reference, i ) {
				var index, keypath, unresolved;
				// Is this an index reference?
				if ( indexRefs && ( index = indexRefs[ reference ] ) !== undefined ) {
					args[ i ] = {
						indexRef: reference,
						value: index
					};
					return;
				}
				// Can we resolve it immediately?
				if ( keypath = resolveRef( ractive, reference, parentFragment ) ) {
					args[ i ] = {
						keypath: keypath
					};
					return;
				}
				// Couldn't resolve yet
				args[ i ] = undefined;
				expressionResolver.pending += 1;
				unresolved = new Unresolved( ractive, reference, parentFragment, function( keypath ) {
					expressionResolver.resolve( i, keypath );
					removeFromArray( expressionResolver.unresolved, unresolved );
				} );
				expressionResolver.unresolved.push( unresolved );
			} );
			this.ready = true;
			this.bubble();
		};
		ExpressionResolver.prototype = {
			bubble: function() {
				if ( !this.ready ) {
					return;
				}
				this.uniqueString = getUniqueString( this.str, this.args );
				this.keypath = getKeypath( this.uniqueString );
				this.createEvaluator();
				this.callback( this.keypath );
			},
			teardown: function() {
				var unresolved;
				while ( unresolved = this.unresolved.pop() ) {
					unresolved.teardown();
				}
			},
			resolve: function( index, keypath ) {
				this.args[ index ] = {
					keypath: keypath
				};
				this.bubble();
				// when all references have been resolved, we can flag the entire expression
				// as having been resolved
				this.resolved = !--this.pending;
			},
			createEvaluator: function() {
				var evaluator;
				// only if it doesn't exist yet!
				if ( !this.root._evaluators[ this.keypath ] ) {
					evaluator = new Evaluator( this.root, this.keypath, this.uniqueString, this.str, this.args, this.owner.priority );
					this.root._evaluators[ this.keypath ] = evaluator;
					evaluator.update();
				} else {
					// we need to trigger a refresh of the evaluator, since it
					// will have become de-synced from the model if we're in a
					// reassignment cycle
					this.root._evaluators[ this.keypath ].refresh();
				}
			},
			reassign: function( indexRef, newIndex, oldKeypath, newKeypath ) {
				var changed;
				this.args.forEach( function( arg ) {
					var changedKeypath;
					if ( arg.keypath && ( changedKeypath = getNewKeypath( arg.keypath, oldKeypath, newKeypath ) ) ) {
						arg.keypath = changedKeypath;
						changed = true;
					} else if ( arg.indexRef === indexRef ) {
						arg.value = newIndex;
						changed = true;
					}
				} );
				if ( changed ) {
					this.bubble();
				}
			}
		};
		return ExpressionResolver;

		function getUniqueString( str, args ) {
			// get string that is unique to this expression
			return str.replace( /\$\{([0-9]+)\}/g, function( match, $1 ) {
				return args[ $1 ] ? args[ $1 ].value || args[ $1 ].keypath : 'undefined';
			} );
		}

		function getKeypath( uniqueString ) {
			// Sanitize by removing any periods or square brackets. Otherwise
			// we can't split the keypath into keys!
			return '${' + uniqueString.replace( /[\.\[\]]/g, '-' ) + '}';
		}
	}( utils_removeFromArray, shared_resolveRef, shared_Unresolved, render_shared_Evaluator__Evaluator, render_shared_utils_getNewKeypath );

	var render_shared_Resolvers_KeypathExpressionResolver = function( types, removeFromArray, resolveRef, Unresolved, registerDependant, unregisterDependant, ExpressionResolver ) {

		var KeypathExpressionResolver = function( mustache, descriptor, callback ) {
			var resolver = this,
				ractive, parentFragment, keypath, dynamic, members;
			ractive = mustache.root;
			parentFragment = mustache.parentFragment;
			this.ref = descriptor.r;
			this.root = mustache.root;
			this.mustache = mustache;
			this.callback = callback;
			this.pending = 0;
			this.unresolved = [];
			members = this.members = [];
			this.indexRefMembers = [];
			this.keypathObservers = [];
			this.expressionResolvers = [];
			descriptor.m.forEach( function( member, i ) {
				var ref, indexRefs, index, createKeypathObserver, unresolved, expressionResolver;
				if ( typeof member === 'string' ) {
					resolver.members[ i ] = member;
					return;
				}
				// simple reference?
				if ( member.t === types.REFERENCE ) {
					ref = member.n;
					indexRefs = parentFragment.indexRefs;
					if ( indexRefs && ( index = indexRefs[ ref ] ) !== undefined ) {
						members[ i ] = index;
						// make a note of it, in case of reassignments
						resolver.indexRefMembers.push( {
							ref: ref,
							index: i
						} );
						return;
					}
					dynamic = true;
					createKeypathObserver = function( keypath ) {
						var keypathObserver = new KeypathObserver( ractive, keypath, mustache.priority, resolver, i );
						resolver.keypathObservers.push( keypathObserver );
					};
					// Can we resolve the reference immediately?
					if ( keypath = resolveRef( ractive, ref, parentFragment ) ) {
						createKeypathObserver( keypath );
						return;
					}
					// Couldn't resolve yet
					members[ i ] = undefined;
					resolver.pending += 1;
					unresolved = new Unresolved( ractive, ref, parentFragment, function( keypath ) {
						resolver.resolve( i, keypath );
						removeFromArray( resolver.unresolved, unresolved );
					} );
					resolver.unresolved.push( unresolved );
					return null;
				}
				// Otherwise we have an expression in its own right
				dynamic = true;
				resolver.pending += 1;
				expressionResolver = new ExpressionResolver( resolver, parentFragment, member, function( keypath ) {
					resolver.resolve( i, keypath );
					removeFromArray( resolver.unresolved, expressionResolver );
				} );
				resolver.unresolved.push( expressionResolver );
			} );
			// Some keypath expressions (e.g. foo["bar"], or foo[i] where `i` is an
			// index reference) won't change. So we don't need to register any watchers
			if ( !dynamic ) {
				keypath = this.getKeypath();
				callback( keypath );
				return;
			}
			this.ready = true;
			this.bubble();
		};
		KeypathExpressionResolver.prototype = {
			getKeypath: function() {
				return this.ref + '.' + this.members.join( '.' );
			},
			bubble: function() {
				if ( !this.ready || this.pending ) {
					return;
				}
				this.callback( this.getKeypath() );
			},
			resolve: function( index, value ) {
				var keypathObserver = new KeypathObserver( this.root, value, this.mustache.priority, this, index );
				keypathObserver.update();
				this.keypathObservers.push( keypathObserver );
				// when all references have been resolved, we can flag the entire expression
				// as having been resolved
				this.resolved = !--this.pending;
				this.bubble();
			},
			teardown: function() {
				var unresolved;
				while ( unresolved = this.unresolved.pop() ) {
					unresolved.teardown();
				}
			},
			reassign: function( indexRef, newIndex ) {
				var changed, i, member;
				i = this.indexRefMembers.length;
				while ( i-- ) {
					member = this.indexRefMembers[ i ];
					if ( member.ref === indexRef ) {
						changed = true;
						this.members[ member.index ] = newIndex;
					}
				}
				if ( changed ) {
					this.bubble();
				}
			}
		};
		var KeypathObserver = function( ractive, keypath, priority, resolver, index ) {
			this.root = ractive;
			this.keypath = keypath;
			this.priority = priority;
			this.resolver = resolver;
			this.index = index;
			registerDependant( this );
			this.update();
		};
		KeypathObserver.prototype = {
			update: function() {
				var resolver = this.resolver;
				resolver.members[ this.index ] = this.root.get( this.keypath );
				resolver.bubble();
			},
			teardown: function() {
				unregisterDependant( this );
			}
		};
		return KeypathExpressionResolver;
	}( config_types, utils_removeFromArray, shared_resolveRef, shared_Unresolved, shared_registerDependant, shared_unregisterDependant, render_shared_Resolvers_ExpressionResolver );

	var render_shared_Mustache_initialise = function( runloop, resolveRef, KeypathExpressionResolver, ExpressionResolver ) {

		return function initMustache( mustache, options ) {
			var ref, keypath, indexRefs, index, parentFragment, descriptor, resolve;
			parentFragment = options.parentFragment;
			descriptor = options.descriptor;
			mustache.root = parentFragment.root;
			mustache.parentFragment = parentFragment;
			mustache.descriptor = options.descriptor;
			mustache.index = options.index || 0;
			mustache.priority = parentFragment.priority;
			mustache.type = options.descriptor.t;
			resolve = function( keypath ) {
				mustache.resolve( keypath );
			};
			// if this is a simple mustache, with a reference, we just need to resolve
			// the reference to a keypath
			if ( ref = descriptor.r ) {
				indexRefs = parentFragment.indexRefs;
				if ( indexRefs && ( index = indexRefs[ ref ] ) !== undefined ) {
					mustache.indexRef = ref;
					mustache.value = index;
					mustache.render( mustache.value );
				} else {
					keypath = resolveRef( mustache.root, ref, mustache.parentFragment );
					if ( keypath !== undefined ) {
						resolve( keypath );
					} else {
						mustache.ref = ref;
						runloop.addUnresolved( mustache );
					}
				}
			}
			// if it's an expression, we have a bit more work to do
			if ( options.descriptor.x ) {
				mustache.resolver = new ExpressionResolver( mustache, parentFragment, options.descriptor.x, resolve );
			}
			if ( options.descriptor.kx ) {
				mustache.resolver = new KeypathExpressionResolver( mustache, options.descriptor.kx, resolve );
			}
			// Special case - inverted sections
			if ( mustache.descriptor.n && !mustache.hasOwnProperty( 'value' ) ) {
				mustache.render( undefined );
			}
		};
	}( global_runloop, shared_resolveRef, render_shared_Resolvers_KeypathExpressionResolver, render_shared_Resolvers_ExpressionResolver );

	var render_shared_Mustache_update = function( isEqual, get ) {

		var options = {
			evaluateWrapped: true
		};
		return function updateMustache() {
			var value = get( this.root, this.keypath, options );
			if ( !isEqual( value, this.value ) ) {
				this.render( value );
				this.value = value;
			}
		};
	}( utils_isEqual, shared_get__get );

	var render_shared_Mustache_resolve = function( types, registerDependant, unregisterDependant ) {

		return function resolveMustache( keypath ) {
			var i;
			// In some cases, we may resolve to the same keypath (if this is
			// an expression mustache that was reassigned due to an ancestor's
			// keypath) - in which case, this is a no-op
			if ( keypath === this.keypath ) {
				return;
			}
			// if we resolved previously, we need to unregister
			if ( this.registered ) {
				unregisterDependant( this );
				// is this a section? if so, we may have children that need
				// to be reassigned
				// TODO only DOM sections?
				if ( this.type === types.SECTION ) {
					i = this.fragments.length;
					while ( i-- ) {
						this.fragments[ i ].reassign( null, null, this.keypath, keypath );
					}
				}
			}
			this.keypath = keypath;
			registerDependant( this );
			this.update();
		};
	}( config_types, shared_registerDependant, shared_unregisterDependant );

	var render_shared_Mustache_reassign = function( getNewKeypath ) {

		return function reassignMustache( indexRef, newIndex, oldKeypath, newKeypath ) {
			var updated, i;
			// expression mustache?
			if ( this.resolver ) {
				this.resolver.reassign( indexRef, newIndex, oldKeypath, newKeypath );
			} else if ( this.keypath ) {
				updated = getNewKeypath( this.keypath, oldKeypath, newKeypath );
				// was a new keypath created?
				if ( updated ) {
					// resolve it
					this.resolve( updated );
				}
			} else if ( indexRef !== undefined && this.indexRef === indexRef ) {
				this.value = newIndex;
				this.render( newIndex );
			}
			// otherwise, it's an unresolved reference. the context stack has been updated
			// so it will take care of itself
			// if it's a section mustache, we need to go through any children
			if ( this.fragments ) {
				i = this.fragments.length;
				while ( i-- ) {
					this.fragments[ i ].reassign( indexRef, newIndex, oldKeypath, newKeypath );
				}
			}
		};
	}( render_shared_utils_getNewKeypath );

	var render_shared_Mustache__Mustache = function( init, update, resolve, reassign ) {

		return {
			init: init,
			update: update,
			resolve: resolve,
			reassign: reassign
		};
	}( render_shared_Mustache_initialise, render_shared_Mustache_update, render_shared_Mustache_resolve, render_shared_Mustache_reassign );

	var render_DomFragment_Interpolator = function( types, teardown, Mustache, detach ) {

		var DomInterpolator, lessThan, greaterThan;
		lessThan = /</g;
		greaterThan = />/g;
		DomInterpolator = function( options, docFrag ) {
			this.type = types.INTERPOLATOR;
			if ( docFrag ) {
				this.node = document.createTextNode( '' );
				docFrag.appendChild( this.node );
			}
			// extend Mustache
			Mustache.init( this, options );
		};
		DomInterpolator.prototype = {
			update: Mustache.update,
			resolve: Mustache.resolve,
			reassign: Mustache.reassign,
			detach: detach,
			teardown: function( destroy ) {
				if ( destroy ) {
					this.detach();
				}
				teardown( this );
			},
			render: function( value ) {
				if ( this.node ) {
					this.node.data = value == undefined ? '' : value;
				}
			},
			firstNode: function() {
				return this.node;
			},
			toString: function() {
				var value = this.value != undefined ? '' + this.value : '';
				return value.replace( lessThan, '&lt;' ).replace( greaterThan, '&gt;' );
			}
		};
		return DomInterpolator;
	}( config_types, shared_teardown, render_shared_Mustache__Mustache, render_DomFragment_shared_detach );

	var render_DomFragment_Section_prototype_merge = function() {

		var toTeardown = [];
		return function sectionMerge( newIndices ) {
			var section = this,
				parentFragment, firstChange, i, newLength, reassignedFragments, fragmentOptions, fragment, nextNode;
			parentFragment = this.parentFragment;
			reassignedFragments = [];
			// first, reassign existing fragments
			newIndices.forEach( function reassignIfNecessary( newIndex, oldIndex ) {
				var fragment, by, oldKeypath, newKeypath;
				if ( newIndex === oldIndex ) {
					reassignedFragments[ newIndex ] = section.fragments[ oldIndex ];
					return;
				}
				if ( firstChange === undefined ) {
					firstChange = oldIndex;
				}
				// does this fragment need to be torn down?
				if ( newIndex === -1 ) {
					toTeardown.push( section.fragments[ oldIndex ] );
					return;
				}
				// Otherwise, it needs to be reassigned to a new index
				fragment = section.fragments[ oldIndex ];
				by = newIndex - oldIndex;
				oldKeypath = section.keypath + '.' + oldIndex;
				newKeypath = section.keypath + '.' + newIndex;
				fragment.reassign( section.descriptor.i, oldIndex, newIndex, by, oldKeypath, newKeypath );
				reassignedFragments[ newIndex ] = fragment;
			} );
			while ( fragment = toTeardown.pop() ) {
				fragment.teardown( true );
			}
			// If nothing changed with the existing fragments, then we start adding
			// new fragments at the end...
			if ( firstChange === undefined ) {
				firstChange = this.length;
			}
			this.length = newLength = this.root.get( this.keypath ).length;
			if ( newLength === firstChange ) {
				// ...unless there are no new fragments to add
				return;
			}
			// Prepare new fragment options
			fragmentOptions = {
				descriptor: this.descriptor.f,
				root: this.root,
				pNode: parentFragment.pNode,
				owner: this
			};
			if ( this.descriptor.i ) {
				fragmentOptions.indexRef = this.descriptor.i;
			}
			// Add as many new fragments as we need to, or add back existing
			// (detached) fragments
			for ( i = firstChange; i < newLength; i += 1 ) {
				// is this an existing fragment?
				if ( fragment = reassignedFragments[ i ] ) {
					this.docFrag.appendChild( fragment.detach( false ) );
				} else {
					fragmentOptions.context = this.keypath + '.' + i;
					fragmentOptions.index = i;
					fragment = this.createFragment( fragmentOptions );
				}
				this.fragments[ i ] = fragment;
			}
			// reinsert fragment
			nextNode = parentFragment.findNextNode( this );
			parentFragment.pNode.insertBefore( this.docFrag, nextNode );
		};
	}();

	var render_shared_updateSection = function( isArray, isObject ) {

		return function updateSection( section, value ) {
			var fragmentOptions = {
				descriptor: section.descriptor.f,
				root: section.root,
				pNode: section.parentFragment.pNode,
				pElement: section.parentFragment.pElement,
				owner: section
			};
			// if section is inverted, only check for truthiness/falsiness
			if ( section.descriptor.n ) {
				updateConditionalSection( section, value, true, fragmentOptions );
				return;
			}
			// otherwise we need to work out what sort of section we're dealing with
			// if value is an array, or an object with an index reference, iterate through
			if ( isArray( value ) ) {
				updateListSection( section, value, fragmentOptions );
			} else if ( isObject( value ) || typeof value === 'function' ) {
				if ( section.descriptor.i ) {
					updateListObjectSection( section, value, fragmentOptions );
				} else {
					updateContextSection( section, fragmentOptions );
				}
			} else {
				updateConditionalSection( section, value, false, fragmentOptions );
			}
		};

		function updateListSection( section, value, fragmentOptions ) {
			var i, length, fragmentsToRemove;
			length = value.length;
			// if the array is shorter than it was previously, remove items
			if ( length < section.length ) {
				fragmentsToRemove = section.fragments.splice( length, section.length - length );
				while ( fragmentsToRemove.length ) {
					fragmentsToRemove.pop().teardown( true );
				}
			} else {
				if ( length > section.length ) {
					// add any new ones
					for ( i = section.length; i < length; i += 1 ) {
						// append list item to context stack
						fragmentOptions.context = section.keypath + '.' + i;
						fragmentOptions.index = i;
						if ( section.descriptor.i ) {
							fragmentOptions.indexRef = section.descriptor.i;
						}
						section.fragments[ i ] = section.createFragment( fragmentOptions );
					}
				}
			}
			section.length = length;
		}

		function updateListObjectSection( section, value, fragmentOptions ) {
			var id, i, hasKey, fragment;
			hasKey = section.hasKey || ( section.hasKey = {} );
			// remove any fragments that should no longer exist
			i = section.fragments.length;
			while ( i-- ) {
				fragment = section.fragments[ i ];
				if ( !( fragment.index in value ) ) {
					section.fragments[ i ].teardown( true );
					section.fragments.splice( i, 1 );
					hasKey[ fragment.index ] = false;
				}
			}
			// add any that haven't been created yet
			for ( id in value ) {
				if ( !hasKey[ id ] ) {
					fragmentOptions.context = section.keypath + '.' + id;
					fragmentOptions.index = id;
					if ( section.descriptor.i ) {
						fragmentOptions.indexRef = section.descriptor.i;
					}
					section.fragments.push( section.createFragment( fragmentOptions ) );
					hasKey[ id ] = true;
				}
			}
			section.length = section.fragments.length;
		}

		function updateContextSection( section, fragmentOptions ) {
			// ...then if it isn't rendered, render it, adding section.keypath to the context stack
			// (if it is already rendered, then any children dependent on the context stack
			// will update themselves without any prompting)
			if ( !section.length ) {
				// append this section to the context stack
				fragmentOptions.context = section.keypath;
				fragmentOptions.index = 0;
				section.fragments[ 0 ] = section.createFragment( fragmentOptions );
				section.length = 1;
			}
		}

		function updateConditionalSection( section, value, inverted, fragmentOptions ) {
			var doRender, emptyArray, fragmentsToRemove, fragment;
			emptyArray = isArray( value ) && value.length === 0;
			if ( inverted ) {
				doRender = emptyArray || !value;
			} else {
				doRender = value && !emptyArray;
			}
			if ( doRender ) {
				if ( !section.length ) {
					// no change to context stack
					fragmentOptions.index = 0;
					section.fragments[ 0 ] = section.createFragment( fragmentOptions );
					section.length = 1;
				}
				if ( section.length > 1 ) {
					fragmentsToRemove = section.fragments.splice( 1 );
					while ( fragment = fragmentsToRemove.pop() ) {
						fragment.teardown( true );
					}
				}
			} else if ( section.length ) {
				section.teardownFragments( true );
				section.length = 0;
			}
		}
	}( utils_isArray, utils_isObject );

	var render_DomFragment_Section_prototype_render = function( isClient, updateSection ) {

		return function DomSection_prototype_render( value ) {
			var nextNode, wrapped;
			// with sections, we need to get the fake value if we have a wrapped object
			if ( wrapped = this.root._wrapped[ this.keypath ] ) {
				value = wrapped.get();
			}
			// prevent sections from rendering multiple times (happens if
			// evaluators evaluate while update is happening)
			if ( this.rendering ) {
				return;
			}
			this.rendering = true;
			updateSection( this, value );
			this.rendering = false;
			// if we have no new nodes to insert (i.e. the section length stayed the
			// same, or shrank), we don't need to go any further
			if ( this.docFrag && !this.docFrag.childNodes.length ) {
				return;
			}
			// if this isn't the initial render, we need to insert any new nodes in
			// the right place
			if ( !this.initialising && isClient ) {
				// Normally this is just a case of finding the next node, and inserting
				// items before it...
				nextNode = this.parentFragment.findNextNode( this );
				if ( nextNode && nextNode.parentNode === this.parentFragment.pNode ) {
					this.parentFragment.pNode.insertBefore( this.docFrag, nextNode );
				} else {
					// TODO could there be a situation in which later nodes could have
					// been attached to the parent node, i.e. we need to find a sibling
					// to insert before?
					this.parentFragment.pNode.appendChild( this.docFrag );
				}
			}
		};
	}( config_isClient, render_shared_updateSection );

	var render_DomFragment_Section_reassignFragments = function( section, start, end, by ) {
		var i, fragment, indexRef, oldKeypath, newKeypath;
		indexRef = section.descriptor.i;
		for ( i = start; i < end; i += 1 ) {
			fragment = section.fragments[ i ];
			oldKeypath = section.keypath + '.' + ( i - by );
			newKeypath = section.keypath + '.' + i;
			// change the fragment index
			fragment.index = i;
			fragment.reassign( indexRef, i, oldKeypath, newKeypath );
		}
	};

	var render_DomFragment_Section_prototype_splice = function( reassignFragments ) {

		return function( spliceSummary ) {
			var section = this,
				balance, start, insertStart, insertEnd, spliceArgs;
			balance = spliceSummary.balance;
			if ( !balance ) {
				// The array length hasn't changed - we don't need to add or remove anything
				return;
			}
			start = spliceSummary.start;
			section.length += balance;
			// If more items were removed from the array than added, we tear down
			// the excess fragments and remove them...
			if ( balance < 0 ) {
				section.fragments.splice( start, -balance ).forEach( teardown );
				// Reassign fragments after the ones we've just removed
				reassignFragments( section, start, section.length, balance );
				// Nothing more to do
				return;
			}
			// ...otherwise we need to add some things to the DOM.
			insertStart = start + spliceSummary.removed;
			insertEnd = start + spliceSummary.added;
			// Make room for the new fragments by doing a splice that simulates
			// what happened to the data array
			spliceArgs = [
				insertStart,
				0
			];
			spliceArgs.length += balance;
			section.fragments.splice.apply( section.fragments, spliceArgs );
			// Reassign existing fragments at the end of the array
			reassignFragments( section, insertEnd, section.length, balance );
			// Create the new ones
			renderNewFragments( section, insertStart, insertEnd );
		};

		function teardown( fragment ) {
			fragment.teardown( true );
		}

		function renderNewFragments( section, start, end ) {
			var fragmentOptions, i, insertionPoint;
			section.rendering = true;
			fragmentOptions = {
				descriptor: section.descriptor.f,
				root: section.root,
				pNode: section.parentFragment.pNode,
				owner: section,
				indexRef: section.descriptor.i
			};
			for ( i = start; i < end; i += 1 ) {
				fragmentOptions.context = section.keypath + '.' + i;
				fragmentOptions.index = i;
				section.fragments[ i ] = section.createFragment( fragmentOptions );
			}
			// Figure out where these new nodes need to be inserted
			insertionPoint = section.fragments[ end ] ? section.fragments[ end ].firstNode() : section.parentFragment.findNextNode( section );
			// Append docfrag in front of insertion point
			section.parentFragment.pNode.insertBefore( section.docFrag, insertionPoint );
			section.rendering = false;
		}
	}( render_DomFragment_Section_reassignFragments );

	var render_DomFragment_Section__Section = function( types, Mustache, merge, render, splice, teardown, circular ) {

		var DomSection, DomFragment;
		circular.push( function() {
			DomFragment = circular.DomFragment;
		} );
		// Section
		DomSection = function( options, docFrag ) {
			this.type = types.SECTION;
			this.inverted = !! options.descriptor.n;
			this.fragments = [];
			this.length = 0;
			// number of times this section is rendered
			if ( docFrag ) {
				this.docFrag = document.createDocumentFragment();
			}
			this.initialising = true;
			Mustache.init( this, options );
			if ( docFrag ) {
				docFrag.appendChild( this.docFrag );
			}
			this.initialising = false;
		};
		DomSection.prototype = {
			update: Mustache.update,
			resolve: Mustache.resolve,
			reassign: Mustache.reassign,
			splice: splice,
			merge: merge,
			detach: function() {
				var i, len;
				if ( this.docFrag ) {
					len = this.fragments.length;
					for ( i = 0; i < len; i += 1 ) {
						this.docFrag.appendChild( this.fragments[ i ].detach() );
					}
					return this.docFrag;
				}
			},
			teardown: function( destroy ) {
				this.teardownFragments( destroy );
				teardown( this );
			},
			firstNode: function() {
				if ( this.fragments[ 0 ] ) {
					return this.fragments[ 0 ].firstNode();
				}
				return this.parentFragment.findNextNode( this );
			},
			findNextNode: function( fragment ) {
				if ( this.fragments[ fragment.index + 1 ] ) {
					return this.fragments[ fragment.index + 1 ].firstNode();
				}
				return this.parentFragment.findNextNode( this );
			},
			teardownFragments: function( destroy ) {
				var fragment;
				while ( fragment = this.fragments.shift() ) {
					fragment.teardown( destroy );
				}
			},
			render: render,
			createFragment: function( options ) {
				var fragment = new DomFragment( options );
				if ( this.docFrag ) {
					this.docFrag.appendChild( fragment.docFrag );
				}
				return fragment;
			},
			toString: function() {
				var str, i, len;
				str = '';
				i = 0;
				len = this.length;
				for ( i = 0; i < len; i += 1 ) {
					str += this.fragments[ i ].toString();
				}
				return str;
			},
			find: function( selector ) {
				var i, len, queryResult;
				len = this.fragments.length;
				for ( i = 0; i < len; i += 1 ) {
					if ( queryResult = this.fragments[ i ].find( selector ) ) {
						return queryResult;
					}
				}
				return null;
			},
			findAll: function( selector, query ) {
				var i, len;
				len = this.fragments.length;
				for ( i = 0; i < len; i += 1 ) {
					this.fragments[ i ].findAll( selector, query );
				}
			},
			findComponent: function( selector ) {
				var i, len, queryResult;
				len = this.fragments.length;
				for ( i = 0; i < len; i += 1 ) {
					if ( queryResult = this.fragments[ i ].findComponent( selector ) ) {
						return queryResult;
					}
				}
				return null;
			},
			findAllComponents: function( selector, query ) {
				var i, len;
				len = this.fragments.length;
				for ( i = 0; i < len; i += 1 ) {
					this.fragments[ i ].findAllComponents( selector, query );
				}
			}
		};
		return DomSection;
	}( config_types, render_shared_Mustache__Mustache, render_DomFragment_Section_prototype_merge, render_DomFragment_Section_prototype_render, render_DomFragment_Section_prototype_splice, shared_teardown, circular );

	var render_DomFragment_Triple = function( types, matches, Mustache, insertHtml, teardown ) {

		var DomTriple = function( options, docFrag ) {
			this.type = types.TRIPLE;
			if ( docFrag ) {
				this.nodes = [];
				this.docFrag = document.createDocumentFragment();
			}
			this.initialising = true;
			Mustache.init( this, options );
			if ( docFrag ) {
				docFrag.appendChild( this.docFrag );
			}
			this.initialising = false;
		};
		DomTriple.prototype = {
			update: Mustache.update,
			resolve: Mustache.resolve,
			reassign: Mustache.reassign,
			detach: function() {
				var len, i;
				if ( this.docFrag ) {
					len = this.nodes.length;
					for ( i = 0; i < len; i += 1 ) {
						this.docFrag.appendChild( this.nodes[ i ] );
					}
					return this.docFrag;
				}
			},
			teardown: function( destroy ) {
				if ( destroy ) {
					this.detach();
					this.docFrag = this.nodes = null;
				}
				teardown( this );
			},
			firstNode: function() {
				if ( this.nodes[ 0 ] ) {
					return this.nodes[ 0 ];
				}
				return this.parentFragment.findNextNode( this );
			},
			render: function( html ) {
				var node, pNode;
				if ( !this.nodes ) {
					// looks like we're in a server environment...
					// nothing to see here, move along
					return;
				}
				// remove existing nodes
				while ( this.nodes.length ) {
					node = this.nodes.pop();
					node.parentNode.removeChild( node );
				}
				if ( !html ) {
					this.nodes = [];
					return;
				}
				// get new nodes
				pNode = this.parentFragment.pNode;
				this.nodes = insertHtml( html, pNode.tagName, pNode.namespaceURI, this.docFrag );
				if ( !this.initialising ) {
					pNode.insertBefore( this.docFrag, this.parentFragment.findNextNode( this ) );
				}
				// Special case - we're inserting the contents of a <select>
				if ( pNode.tagName === 'SELECT' && pNode._ractive && pNode._ractive.binding ) {
					pNode._ractive.binding.update();
				}
			},
			toString: function() {
				return this.value != undefined ? this.value : '';
			},
			find: function( selector ) {
				var i, len, node, queryResult;
				len = this.nodes.length;
				for ( i = 0; i < len; i += 1 ) {
					node = this.nodes[ i ];
					if ( node.nodeType !== 1 ) {
						continue;
					}
					if ( matches( node, selector ) ) {
						return node;
					}
					if ( queryResult = node.querySelector( selector ) ) {
						return queryResult;
					}
				}
				return null;
			},
			findAll: function( selector, queryResult ) {
				var i, len, node, queryAllResult, numNodes, j;
				len = this.nodes.length;
				for ( i = 0; i < len; i += 1 ) {
					node = this.nodes[ i ];
					if ( node.nodeType !== 1 ) {
						continue;
					}
					if ( matches( node, selector ) ) {
						queryResult.push( node );
					}
					if ( queryAllResult = node.querySelectorAll( selector ) ) {
						numNodes = queryAllResult.length;
						for ( j = 0; j < numNodes; j += 1 ) {
							queryResult.push( queryAllResult[ j ] );
						}
					}
				}
			}
		};
		return DomTriple;
	}( config_types, utils_matches, render_shared_Mustache__Mustache, render_DomFragment_shared_insertHtml, shared_teardown );

	var render_DomFragment_Element_initialise_getElementNamespace = function( namespaces ) {

		return function( descriptor, parentNode ) {
			// if the element has an xmlns attribute, use that
			if ( descriptor.a && descriptor.a.xmlns ) {
				return descriptor.a.xmlns;
			}
			// otherwise, use the svg namespace if this is an svg element, or inherit namespace from parent
			return descriptor.e === 'svg' ? namespaces.svg : parentNode.namespaceURI || namespaces.html;
		};
	}( config_namespaces );

	var render_DomFragment_shared_enforceCase = function() {

		var svgCamelCaseElements, svgCamelCaseAttributes, createMap, map;
		svgCamelCaseElements = 'altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath vkern'.split( ' ' );
		svgCamelCaseAttributes = 'attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits contentScriptType contentStyleType diffuseConstant edgeMode externalResourcesRequired filterRes filterUnits glyphRef gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan'.split( ' ' );
		createMap = function( items ) {
			var map = {}, i = items.length;
			while ( i-- ) {
				map[ items[ i ].toLowerCase() ] = items[ i ];
			}
			return map;
		};
		map = createMap( svgCamelCaseElements.concat( svgCamelCaseAttributes ) );
		return function( elementName ) {
			var lowerCaseElementName = elementName.toLowerCase();
			return map[ lowerCaseElementName ] || lowerCaseElementName;
		};
	}();

	var render_DomFragment_Attribute_helpers_determineNameAndNamespace = function( namespaces, enforceCase ) {

		return function( attribute, name ) {
			var colonIndex, namespacePrefix;
			// are we dealing with a namespaced attribute, e.g. xlink:href?
			colonIndex = name.indexOf( ':' );
			if ( colonIndex !== -1 ) {
				// looks like we are, yes...
				namespacePrefix = name.substr( 0, colonIndex );
				// ...unless it's a namespace *declaration*, which we ignore (on the assumption
				// that only valid namespaces will be used)
				if ( namespacePrefix !== 'xmlns' ) {
					name = name.substring( colonIndex + 1 );
					attribute.name = enforceCase( name );
					attribute.lcName = attribute.name.toLowerCase();
					attribute.namespace = namespaces[ namespacePrefix.toLowerCase() ];
					if ( !attribute.namespace ) {
						throw 'Unknown namespace ("' + namespacePrefix + '")';
					}
					return;
				}
			}
			// SVG attribute names are case sensitive
			attribute.name = attribute.element.namespace !== namespaces.html ? enforceCase( name ) : name;
			attribute.lcName = attribute.name.toLowerCase();
		};
	}( config_namespaces, render_DomFragment_shared_enforceCase );

	var render_DomFragment_Attribute_helpers_setStaticAttribute = function( namespaces ) {

		return function setStaticAttribute( attribute, options ) {
			var node, value = options.value === null ? '' : options.value;
			if ( node = options.pNode ) {
				if ( attribute.namespace ) {
					node.setAttributeNS( attribute.namespace, options.name, value );
				} else {
					// is it a style attribute? and are we in a broken POS browser?
					if ( options.name === 'style' && node.style.setAttribute ) {
						node.style.setAttribute( 'cssText', value );
					} else if ( options.name === 'class' && ( !node.namespaceURI || node.namespaceURI === namespaces.html ) ) {
						node.className = value;
					} else {
						node.setAttribute( options.name, value );
					}
				}
				if ( attribute.name === 'id' ) {
					options.root.nodes[ options.value ] = node;
				}
				if ( attribute.name === 'value' ) {
					node._ractive.value = options.value;
				}
			}
			attribute.value = options.value;
		};
	}( config_namespaces );

	var render_DomFragment_Attribute_helpers_determinePropertyName = function( namespaces ) {

		// the property name equivalents for element attributes, where they differ
		// from the lowercased attribute name
		var propertyNames = {
			'accept-charset': 'acceptCharset',
			accesskey: 'accessKey',
			bgcolor: 'bgColor',
			'class': 'className',
			codebase: 'codeBase',
			colspan: 'colSpan',
			contenteditable: 'contentEditable',
			datetime: 'dateTime',
			dirname: 'dirName',
			'for': 'htmlFor',
			'http-equiv': 'httpEquiv',
			ismap: 'isMap',
			maxlength: 'maxLength',
			novalidate: 'noValidate',
			pubdate: 'pubDate',
			readonly: 'readOnly',
			rowspan: 'rowSpan',
			tabindex: 'tabIndex',
			usemap: 'useMap'
		};
		return function( attribute, options ) {
			var propertyName;
			if ( attribute.pNode && !attribute.namespace && ( !options.pNode.namespaceURI || options.pNode.namespaceURI === namespaces.html ) ) {
				propertyName = propertyNames[ attribute.name ] || attribute.name;
				if ( options.pNode[ propertyName ] !== undefined ) {
					attribute.propertyName = propertyName;
				}
				// is attribute a boolean attribute or 'value'? If so we're better off doing e.g.
				// node.selected = true rather than node.setAttribute( 'selected', '' )
				if ( typeof options.pNode[ propertyName ] === 'boolean' || propertyName === 'value' ) {
					attribute.useProperty = true;
				}
			}
		};
	}( config_namespaces );

	var render_DomFragment_Attribute_helpers_getInterpolator = function( types ) {

		return function getInterpolator( attribute ) {
			var items, item;
			items = attribute.fragment.items;
			if ( items.length !== 1 ) {
				return;
			}
			item = items[ 0 ];
			if ( item.type !== types.INTERPOLATOR || !item.keypath && !item.ref ) {
				return;
			}
			return item;
		};
	}( config_types );

	var utils_arrayContentsMatch = function( isArray ) {

		return function( a, b ) {
			var i;
			if ( !isArray( a ) || !isArray( b ) ) {
				return false;
			}
			if ( a.length !== b.length ) {
				return false;
			}
			i = a.length;
			while ( i-- ) {
				if ( a[ i ] !== b[ i ] ) {
					return false;
				}
			}
			return true;
		};
	}( utils_isArray );

	var render_DomFragment_Attribute_prototype_bind = function( runloop, warn, arrayContentsMatch, getValueFromCheckboxes, get, set ) {

		var singleMustacheError = 'For two-way binding to work, attribute value must be a single interpolator (e.g. value="{{foo}}")',
			expressionError = 'You cannot set up two-way binding against an expression ',
			bindAttribute, updateModel, getOptions, update, getBinding, inheritProperties, MultipleSelectBinding, SelectBinding, RadioNameBinding, CheckboxNameBinding, CheckedBinding, FileListBinding, ContentEditableBinding, GenericBinding;
		bindAttribute = function() {
			var node = this.pNode,
				interpolator, binding, bindings;
			interpolator = this.interpolator;
			if ( !interpolator ) {
				warn( singleMustacheError );
				return false;
			}
			if ( interpolator.keypath && interpolator.keypath.substr === '${' ) {
				warn( expressionError + interpolator.keypath );
				return false;
			}
			// Hmmm. Not sure if this is the best way to handle this ambiguity...
			//
			// Let's say we were given `value="{{bar}}"`. If the context stack was
			// context stack was `["foo"]`, and `foo.bar` *wasn't* `undefined`, the
			// keypath would be `foo.bar`. Then, any user input would result in
			// `foo.bar` being updated.
			//
			// If, however, `foo.bar` *was* undefined, and so was `bar`, we would be
			// left with an unresolved partial keypath - so we are forced to make an
			// assumption. That assumption is that the input in question should
			// be forced to resolve to `bar`, and any user input would affect `bar`
			// and not `foo.bar`.
			//
			// Did that make any sense? No? Oh. Sorry. Well the moral of the story is
			// be explicit when using two-way data-binding about what keypath you're
			// updating. Using it in lists is probably a recipe for confusion...
			if ( !interpolator.keypath ) {
				interpolator.resolve( interpolator.descriptor.r );
			}
			this.keypath = interpolator.keypath;
			binding = getBinding( this );
			if ( !binding ) {
				return false;
			}
			node._ractive.binding = this.element.binding = binding;
			this.twoway = true;
			// register this with the root, so that we can force an update later
			bindings = this.root._twowayBindings[ this.keypath ] || ( this.root._twowayBindings[ this.keypath ] = [] );
			bindings.push( binding );
			return true;
		};
		// This is the handler for DOM events that would lead to a change in the model
		// (i.e. change, sometimes, input, and occasionally click and keyup)
		updateModel = function() {
			runloop.start( this._ractive.root );
			this._ractive.binding.update();
			runloop.end();
		};
		getOptions = {
			evaluateWrapped: true
		};
		update = function() {
			var value = get( this._ractive.root, this._ractive.binding.keypath, getOptions );
			this.value = value == undefined ? '' : value;
		};
		getBinding = function( attribute ) {
			var node = attribute.pNode;
			if ( node.tagName === 'SELECT' ) {
				return node.multiple ? new MultipleSelectBinding( attribute, node ) : new SelectBinding( attribute, node );
			}
			if ( node.type === 'checkbox' || node.type === 'radio' ) {
				if ( attribute.propertyName === 'name' ) {
					if ( node.type === 'checkbox' ) {
						return new CheckboxNameBinding( attribute, node );
					}
					if ( node.type === 'radio' ) {
						return new RadioNameBinding( attribute, node );
					}
				}
				if ( attribute.propertyName === 'checked' ) {
					return new CheckedBinding( attribute, node );
				}
				return null;
			}
			if ( attribute.lcName !== 'value' ) {
				throw new Error( 'Attempted to set up an illegal two-way binding. This error is unexpected - if you can, please file an issue at https://github.com/RactiveJS/Ractive, or contact @RactiveJS on Twitter. Thanks!' );
			}
			if ( node.type === 'file' ) {
				return new FileListBinding( attribute, node );
			}
			if ( node.getAttribute( 'contenteditable' ) ) {
				return new ContentEditableBinding( attribute, node );
			}
			return new GenericBinding( attribute, node );
		};
		MultipleSelectBinding = function( attribute, node ) {
			var valueFromModel;
			inheritProperties( this, attribute, node );
			node.addEventListener( 'change', updateModel, false );
			valueFromModel = get( this.root, this.keypath );
			if ( valueFromModel === undefined ) {
				// get value from DOM, if possible
				this.update();
			}
		};
		MultipleSelectBinding.prototype = {
			value: function() {
				var selectedValues, options, i, len, option, optionValue;
				selectedValues = [];
				options = this.node.options;
				len = options.length;
				for ( i = 0; i < len; i += 1 ) {
					option = options[ i ];
					if ( option.selected ) {
						optionValue = option._ractive ? option._ractive.value : option.value;
						selectedValues.push( optionValue );
					}
				}
				return selectedValues;
			},
			update: function() {
				var attribute, previousValue, value;
				attribute = this.attr;
				previousValue = attribute.value;
				value = this.value();
				if ( previousValue === undefined || !arrayContentsMatch( value, previousValue ) ) {
					// either length or contents have changed, so we update the model
					runloop.addBinding( attribute );
					attribute.value = value;
					set( this.root, this.keypath, value );
					runloop.trigger();
				}
				return this;
			},
			deferUpdate: function() {
				if ( this.deferred === true ) {
					return;
				}
				// TODO we're hijacking an existing bit of functionality here...
				// the whole deferred updates thing could use a spring clean
				runloop.addAttribute( this );
				this.deferred = true;
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
			}
		};
		SelectBinding = function( attribute, node ) {
			var valueFromModel;
			inheritProperties( this, attribute, node );
			node.addEventListener( 'change', updateModel, false );
			valueFromModel = get( this.root, this.keypath );
			if ( valueFromModel === undefined ) {
				// get value from DOM, if possible
				this.update();
			}
		};
		SelectBinding.prototype = {
			value: function() {
				var options, i, len, option, optionValue;
				options = this.node.options;
				len = options.length;
				for ( i = 0; i < len; i += 1 ) {
					option = options[ i ];
					if ( options[ i ].selected ) {
						optionValue = option._ractive ? option._ractive.value : option.value;
						return optionValue;
					}
				}
			},
			update: function() {
				var value = this.value();
				runloop.addBinding( this.attr );
				this.attr.value = value;
				set( this.root, this.keypath, value );
				runloop.trigger();
				return this;
			},
			deferUpdate: function() {
				if ( this.deferred === true ) {
					return;
				}
				// TODO we're hijacking an existing bit of functionality here...
				// the whole deferred updates thing could use a spring clean
				runloop.addAttribute( this );
				this.deferred = true;
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
			}
		};
		RadioNameBinding = function( attribute, node ) {
			var valueFromModel;
			this.radioName = true;
			// so that updateModel knows what to do with this
			inheritProperties( this, attribute, node );
			node.name = '{{' + attribute.keypath + '}}';
			node.addEventListener( 'change', updateModel, false );
			if ( node.attachEvent ) {
				node.addEventListener( 'click', updateModel, false );
			}
			valueFromModel = get( this.root, this.keypath );
			if ( valueFromModel !== undefined ) {
				node.checked = valueFromModel == node._ractive.value;
			} else {
				runloop.addRadio( this );
			}
		};
		RadioNameBinding.prototype = {
			value: function() {
				return this.node._ractive ? this.node._ractive.value : this.node.value;
			},
			update: function() {
				var node = this.node;
				if ( node.checked ) {
					runloop.addBinding( this.attr );
					set( this.root, this.keypath, this.value() );
					runloop.trigger();
				}
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
				this.node.removeEventListener( 'click', updateModel, false );
			}
		};
		CheckboxNameBinding = function( attribute, node ) {
			var valueFromModel, checked;
			this.checkboxName = true;
			// so that updateModel knows what to do with this
			inheritProperties( this, attribute, node );
			node.name = '{{' + this.keypath + '}}';
			node.addEventListener( 'change', updateModel, false );
			// in case of IE emergency, bind to click event as well
			if ( node.attachEvent ) {
				node.addEventListener( 'click', updateModel, false );
			}
			valueFromModel = get( this.root, this.keypath );
			// if the model already specifies this value, check/uncheck accordingly
			if ( valueFromModel !== undefined ) {
				checked = valueFromModel.indexOf( node._ractive.value ) !== -1;
				node.checked = checked;
			} else {
				runloop.addCheckbox( this );
			}
		};
		CheckboxNameBinding.prototype = {
			changed: function() {
				return this.node.checked !== !! this.checked;
			},
			update: function() {
				this.checked = this.node.checked;
				runloop.addBinding( this.attr );
				set( this.root, this.keypath, getValueFromCheckboxes( this.root, this.keypath ) );
				runloop.trigger();
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
				this.node.removeEventListener( 'click', updateModel, false );
			}
		};
		CheckedBinding = function( attribute, node ) {
			inheritProperties( this, attribute, node );
			node.addEventListener( 'change', updateModel, false );
			if ( node.attachEvent ) {
				node.addEventListener( 'click', updateModel, false );
			}
		};
		CheckedBinding.prototype = {
			value: function() {
				return this.node.checked;
			},
			update: function() {
				runloop.addBinding( this.attr );
				set( this.root, this.keypath, this.value() );
				runloop.trigger();
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
				this.node.removeEventListener( 'click', updateModel, false );
			}
		};
		FileListBinding = function( attribute, node ) {
			inheritProperties( this, attribute, node );
			node.addEventListener( 'change', updateModel, false );
		};
		FileListBinding.prototype = {
			value: function() {
				return this.attr.pNode.files;
			},
			update: function() {
				set( this.attr.root, this.attr.keypath, this.value() );
				runloop.trigger();
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
			}
		};
		ContentEditableBinding = function( attribute, node ) {
			inheritProperties( this, attribute, node );
			node.addEventListener( 'change', updateModel, false );
			if ( !this.root.lazy ) {
				node.addEventListener( 'input', updateModel, false );
				if ( node.attachEvent ) {
					node.addEventListener( 'keyup', updateModel, false );
				}
			}
		};
		ContentEditableBinding.prototype = {
			update: function() {
				runloop.addBinding( this.attr );
				set( this.root, this.keypath, this.node.innerHTML );
				runloop.trigger();
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
				this.node.removeEventListener( 'input', updateModel, false );
				this.node.removeEventListener( 'keyup', updateModel, false );
			}
		};
		GenericBinding = function( attribute, node ) {
			inheritProperties( this, attribute, node );
			node.addEventListener( 'change', updateModel, false );
			if ( !this.root.lazy ) {
				node.addEventListener( 'input', updateModel, false );
				if ( node.attachEvent ) {
					node.addEventListener( 'keyup', updateModel, false );
				}
			}
			this.node.addEventListener( 'blur', update, false );
		};
		GenericBinding.prototype = {
			value: function() {
				var value = this.attr.pNode.value;
				// if the value is numeric, treat it as a number. otherwise don't
				if ( +value + '' === value && value.indexOf( 'e' ) === -1 ) {
					value = +value;
				}
				return value;
			},
			update: function() {
				var attribute = this.attr,
					value = this.value();
				runloop.addBinding( attribute );
				set( attribute.root, attribute.keypath, value );
				runloop.trigger();
			},
			teardown: function() {
				this.node.removeEventListener( 'change', updateModel, false );
				this.node.removeEventListener( 'input', updateModel, false );
				this.node.removeEventListener( 'keyup', updateModel, false );
				this.node.removeEventListener( 'blur', update, false );
			}
		};
		inheritProperties = function( binding, attribute, node ) {
			binding.attr = attribute;
			binding.node = node;
			binding.root = attribute.root;
			binding.keypath = attribute.keypath;
		};
		return bindAttribute;
	}( global_runloop, utils_warn, utils_arrayContentsMatch, shared_getValueFromCheckboxes, shared_get__get, shared_set );

	var render_DomFragment_Attribute_prototype_update = function( runloop, namespaces, isArray ) {

		var updateAttribute, updateFileInputValue, deferSelect, initSelect, updateSelect, updateMultipleSelect, updateRadioName, updateCheckboxName, updateIEStyleAttribute, updateClassName, updateContentEditableValue, updateEverythingElse;
		// There are a few special cases when it comes to updating attributes. For this reason,
		// the prototype .update() method points to updateAttribute, which waits until the
		// attribute has finished initialising, then replaces the prototype method with a more
		// suitable one. That way, we save ourselves doing a bunch of tests on each call
		updateAttribute = function() {
			var node;
			if ( !this.ready ) {
				return this;
			}
			node = this.pNode;
			// special case - selects
			if ( node.tagName === 'SELECT' && this.lcName === 'value' ) {
				this.update = deferSelect;
				this.deferredUpdate = initSelect;
				// we don't know yet if it's a select-one or select-multiple
				return this.update();
			}
			// special case - <input type='file' value='{{fileList}}'>
			if ( this.isFileInputValue ) {
				this.update = updateFileInputValue;
				// save ourselves the trouble next time
				return this;
			}
			// special case - <input type='radio' name='{{twoway}}' value='foo'>
			if ( this.twoway && this.lcName === 'name' ) {
				if ( node.type === 'radio' ) {
					this.update = updateRadioName;
					return this.update();
				}
				if ( node.type === 'checkbox' ) {
					this.update = updateCheckboxName;
					return this.update();
				}
			}
			// special case - style attributes in Internet Exploder
			if ( this.lcName === 'style' && node.style.setAttribute ) {
				this.update = updateIEStyleAttribute;
				return this.update();
			}
			// special case - class names. IE fucks things up, again
			if ( this.lcName === 'class' && ( !node.namespaceURI || node.namespaceURI === namespaces.html ) ) {
				this.update = updateClassName;
				return this.update();
			}
			// special case - contenteditable
			if ( node.getAttribute( 'contenteditable' ) && this.lcName === 'value' ) {
				this.update = updateContentEditableValue;
				return this.update();
			}
			this.update = updateEverythingElse;
			return this.update();
		};
		updateFileInputValue = function() {
			return this;
		};
		initSelect = function() {
			// we're now in a position to decide whether this is a select-one or select-multiple
			this.deferredUpdate = this.pNode.multiple ? updateMultipleSelect : updateSelect;
			this.deferredUpdate();
		};
		deferSelect = function() {
			// because select values depend partly on the values of their children, and their
			// children may be entering and leaving the DOM, we wait until updates are
			// complete before updating
			runloop.addSelectValue( this );
			return this;
		};
		updateSelect = function() {
			var value = this.fragment.getValue(),
				options, option, optionValue, i;
			this.value = this.pNode._ractive.value = value;
			options = this.pNode.options;
			i = options.length;
			while ( i-- ) {
				option = options[ i ];
				optionValue = option._ractive ? option._ractive.value : option.value;
				// options inserted via a triple don't have _ractive
				if ( optionValue == value ) {
					// double equals as we may be comparing numbers with strings
					option.selected = true;
					return this;
				}
			}
			// if we're still here, it means the new value didn't match any of the options...
			// TODO figure out what to do in this situation
			return this;
		};
		updateMultipleSelect = function() {
			var value = this.fragment.getValue(),
				options, i, option, optionValue;
			if ( !isArray( value ) ) {
				value = [ value ];
			}
			options = this.pNode.options;
			i = options.length;
			while ( i-- ) {
				option = options[ i ];
				optionValue = option._ractive ? option._ractive.value : option.value;
				// options inserted via a triple don't have _ractive
				option.selected = value.indexOf( optionValue ) !== -1;
			}
			this.value = value;
			return this;
		};
		updateRadioName = function() {
			var node, value;
			node = this.pNode;
			value = this.fragment.getValue();
			node.checked = value == node._ractive.value;
			return this;
		};
		updateCheckboxName = function() {
			var node, value;
			node = this.pNode;
			value = this.fragment.getValue();
			if ( !isArray( value ) ) {
				node.checked = value == node._ractive.value;
				return this;
			}
			node.checked = value.indexOf( node._ractive.value ) !== -1;
			return this;
		};
		updateIEStyleAttribute = function() {
			var node, value;
			node = this.pNode;
			value = this.fragment.getValue();
			if ( value === undefined ) {
				value = '';
			}
			if ( value !== this.value ) {
				node.style.setAttribute( 'cssText', value );
				this.value = value;
			}
			return this;
		};
		updateClassName = function() {
			var node, value;
			node = this.pNode;
			value = this.fragment.getValue();
			if ( value === undefined ) {
				value = '';
			}
			if ( value !== this.value ) {
				node.className = value;
				this.value = value;
			}
			return this;
		};
		updateContentEditableValue = function() {
			var node, value;
			node = this.pNode;
			value = this.fragment.getValue();
			if ( value === undefined ) {
				value = '';
			}
			if ( value !== this.value ) {
				if ( !this.active ) {
					node.innerHTML = value;
				}
				this.value = value;
			}
			return this;
		};
		updateEverythingElse = function() {
			var node, value, binding;
			node = this.pNode;
			value = this.fragment.getValue();
			// store actual value, so it doesn't get coerced to a string
			if ( this.isValueAttribute ) {
				node._ractive.value = value;
			}
			if ( value == undefined ) {
				value = '';
			}
			if ( value !== this.value ) {
				if ( this.useProperty ) {
					// with two-way binding, only update if the change wasn't initiated by the user
					// otherwise the cursor will often be sent to the wrong place
					if ( !this.active ) {
						node[ this.propertyName ] = value;
					}
					// special case - a selected option whose select element has two-way binding
					if ( node.tagName === 'OPTION' && node.selected && ( binding = this.element.select.binding ) ) {
						binding.update();
					}
					this.value = value;
					return this;
				}
				if ( this.namespace ) {
					node.setAttributeNS( this.namespace, this.name, value );
					this.value = value;
					return this;
				}
				if ( this.lcName === 'id' ) {
					if ( this.value !== undefined ) {
						this.root.nodes[ this.value ] = undefined;
					}
					this.root.nodes[ value ] = node;
				}
				node.setAttribute( this.name, value );
				this.value = value;
			}
			return this;
		};
		return updateAttribute;
	}( global_runloop, config_namespaces, utils_isArray );

	var parse_Tokenizer_utils_getStringMatch = function( string ) {
		var substr;
		substr = this.str.substr( this.pos, string.length );
		if ( substr === string ) {
			this.pos += string.length;
			return string;
		}
		return null;
	};

	var parse_Tokenizer_utils_allowWhitespace = function() {

		var leadingWhitespace = /^\s+/;
		return function() {
			var match = leadingWhitespace.exec( this.remaining() );
			if ( !match ) {
				return null;
			}
			this.pos += match[ 0 ].length;
			return match[ 0 ];
		};
	}();

	var parse_Tokenizer_utils_makeRegexMatcher = function( regex ) {
		return function( tokenizer ) {
			var match = regex.exec( tokenizer.str.substring( tokenizer.pos ) );
			if ( !match ) {
				return null;
			}
			tokenizer.pos += match[ 0 ].length;
			return match[ 1 ] || match[ 0 ];
		};
	};

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_makeQuotedStringMatcher = function( makeRegexMatcher ) {

		var getStringMiddle, getEscapeSequence, getLineContinuation;
		// Match one or more characters until: ", ', \, or EOL/EOF.
		// EOL/EOF is written as (?!.) (meaning there's no non-newline char next).
		getStringMiddle = makeRegexMatcher( /^(?=.)[^"'\\]+?(?:(?!.)|(?=["'\\]))/ );
		// Match one escape sequence, including the backslash.
		getEscapeSequence = makeRegexMatcher( /^\\(?:['"\\bfnrt]|0(?![0-9])|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|(?=.)[^ux0-9])/ );
		// Match one ES5 line continuation (backslash + line terminator).
		getLineContinuation = makeRegexMatcher( /^\\(?:\r\n|[\u000A\u000D\u2028\u2029])/ );
		// Helper for defining getDoubleQuotedString and getSingleQuotedString.
		return function( okQuote ) {
			return function( tokenizer ) {
				var start, literal, done, next;
				start = tokenizer.pos;
				literal = '"';
				done = false;
				while ( !done ) {
					next = getStringMiddle( tokenizer ) || getEscapeSequence( tokenizer ) || tokenizer.getStringMatch( okQuote );
					if ( next ) {
						if ( next === '"' ) {
							literal += '\\"';
						} else if ( next === '\\\'' ) {
							literal += '\'';
						} else {
							literal += next;
						}
					} else {
						next = getLineContinuation( tokenizer );
						if ( next ) {
							// convert \(newline-like) into a \u escape, which is allowed in JSON
							literal += '\\u' + ( '000' + next.charCodeAt( 1 ).toString( 16 ) ).slice( -4 );
						} else {
							done = true;
						}
					}
				}
				literal += '"';
				// use JSON.parse to interpret escapes
				return JSON.parse( literal );
			};
		};
	}( parse_Tokenizer_utils_makeRegexMatcher );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getSingleQuotedString = function( makeQuotedStringMatcher ) {

		return makeQuotedStringMatcher( '"' );
	}( parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_makeQuotedStringMatcher );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getDoubleQuotedString = function( makeQuotedStringMatcher ) {

		return makeQuotedStringMatcher( '\'' );
	}( parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_makeQuotedStringMatcher );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral = function( types, getSingleQuotedString, getDoubleQuotedString ) {

		return function( tokenizer ) {
			var start, string;
			start = tokenizer.pos;
			if ( tokenizer.getStringMatch( '"' ) ) {
				string = getDoubleQuotedString( tokenizer );
				if ( !tokenizer.getStringMatch( '"' ) ) {
					tokenizer.pos = start;
					return null;
				}
				return {
					t: types.STRING_LITERAL,
					v: string
				};
			}
			if ( tokenizer.getStringMatch( '\'' ) ) {
				string = getSingleQuotedString( tokenizer );
				if ( !tokenizer.getStringMatch( '\'' ) ) {
					tokenizer.pos = start;
					return null;
				}
				return {
					t: types.STRING_LITERAL,
					v: string
				};
			}
			return null;
		};
	}( config_types, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getSingleQuotedString, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral_getDoubleQuotedString );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getNumberLiteral = function( types, makeRegexMatcher ) {

		// bulletproof number regex from https://gist.github.com/Rich-Harris/7544330
		var getNumber = makeRegexMatcher( /^(?:[+-]?)(?:(?:(?:0|[1-9]\d*)?\.\d+)|(?:(?:0|[1-9]\d*)\.)|(?:0|[1-9]\d*))(?:[eE][+-]?\d+)?/ );
		return function( tokenizer ) {
			var result;
			if ( result = getNumber( tokenizer ) ) {
				return {
					t: types.NUMBER_LITERAL,
					v: result
				};
			}
			return null;
		};
	}( config_types, parse_Tokenizer_utils_makeRegexMatcher );

	var parse_Tokenizer_getExpression_shared_getName = function( makeRegexMatcher ) {

		return makeRegexMatcher( /^[a-zA-Z_$][a-zA-Z_$0-9]*/ );
	}( parse_Tokenizer_utils_makeRegexMatcher );

	var parse_Tokenizer_getExpression_shared_getKey = function( getStringLiteral, getNumberLiteral, getName ) {

		var identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
		// http://mathiasbynens.be/notes/javascript-properties
		// can be any name, string literal, or number literal
		return function( tokenizer ) {
			var token;
			if ( token = getStringLiteral( tokenizer ) ) {
				return identifier.test( token.v ) ? token.v : '"' + token.v.replace( /"/g, '\\"' ) + '"';
			}
			if ( token = getNumberLiteral( tokenizer ) ) {
				return token.v;
			}
			if ( token = getName( tokenizer ) ) {
				return token;
			}
		};
	}( parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getNumberLiteral, parse_Tokenizer_getExpression_shared_getName );

	var utils_parseJSON = function( getStringMatch, allowWhitespace, getStringLiteral, getKey ) {

		// simple JSON parser, without the restrictions of JSON parse
		// (i.e. having to double-quote keys).
		//
		// This re-uses logic from the main template parser, albeit
		// messily. Could probably use a cleanup at some point.
		//
		// If passed a hash of values as the second argument, ${placeholders}
		// will be replaced with those values
		var Tokenizer, specials, specialsPattern, numberPattern, placeholderPattern, placeholderAtStartPattern;
		specials = {
			'true': true,
			'false': false,
			'undefined': undefined,
			'null': null
		};
		specialsPattern = new RegExp( '^(?:' + Object.keys( specials ).join( '|' ) + ')' );
		numberPattern = /^(?:[+-]?)(?:(?:(?:0|[1-9]\d*)?\.\d+)|(?:(?:0|[1-9]\d*)\.)|(?:0|[1-9]\d*))(?:[eE][+-]?\d+)?/;
		placeholderPattern = /\$\{([^\}]+)\}/g;
		placeholderAtStartPattern = /^\$\{([^\}]+)\}/;
		Tokenizer = function( str, values ) {
			this.str = str;
			this.values = values;
			this.pos = 0;
			this.result = this.getToken();
		};
		Tokenizer.prototype = {
			remaining: function() {
				return this.str.substring( this.pos );
			},
			getStringMatch: getStringMatch,
			getToken: function() {
				this.allowWhitespace();
				return this.getPlaceholder() || this.getSpecial() || this.getNumber() || this.getString() || this.getObject() || this.getArray();
			},
			getPlaceholder: function() {
				var match;
				if ( !this.values ) {
					return null;
				}
				if ( ( match = placeholderAtStartPattern.exec( this.remaining() ) ) && this.values.hasOwnProperty( match[ 1 ] ) ) {
					this.pos += match[ 0 ].length;
					return {
						v: this.values[ match[ 1 ] ]
					};
				}
			},
			getSpecial: function() {
				var match;
				if ( match = specialsPattern.exec( this.remaining() ) ) {
					this.pos += match[ 0 ].length;
					return {
						v: specials[ match[ 0 ] ]
					};
				}
			},
			getNumber: function() {
				var match;
				if ( match = numberPattern.exec( this.remaining() ) ) {
					this.pos += match[ 0 ].length;
					return {
						v: +match[ 0 ]
					};
				}
			},
			getString: function() {
				var stringLiteral = getStringLiteral( this ),
					values;
				if ( stringLiteral && ( values = this.values ) ) {
					return {
						v: stringLiteral.v.replace( placeholderPattern, function( match, $1 ) {
							return values[ $1 ] || $1;
						} )
					};
				}
				return stringLiteral;
			},
			getObject: function() {
				var result, pair;
				if ( !this.getStringMatch( '{' ) ) {
					return null;
				}
				result = {};
				while ( pair = getKeyValuePair( this ) ) {
					result[ pair.key ] = pair.value;
					this.allowWhitespace();
					if ( this.getStringMatch( '}' ) ) {
						return {
							v: result
						};
					}
					if ( !this.getStringMatch( ',' ) ) {
						return null;
					}
				}
				return null;
			},
			getArray: function() {
				var result, valueToken;
				if ( !this.getStringMatch( '[' ) ) {
					return null;
				}
				result = [];
				while ( valueToken = this.getToken() ) {
					result.push( valueToken.v );
					if ( this.getStringMatch( ']' ) ) {
						return {
							v: result
						};
					}
					if ( !this.getStringMatch( ',' ) ) {
						return null;
					}
				}
				return null;
			},
			allowWhitespace: allowWhitespace
		};

		function getKeyValuePair( tokenizer ) {
			var key, valueToken, pair;
			tokenizer.allowWhitespace();
			key = getKey( tokenizer );
			if ( !key ) {
				return null;
			}
			pair = {
				key: key
			};
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( ':' ) ) {
				return null;
			}
			tokenizer.allowWhitespace();
			valueToken = tokenizer.getToken();
			if ( !valueToken ) {
				return null;
			}
			pair.value = valueToken.v;
			return pair;
		}
		return function( str, values ) {
			var tokenizer = new Tokenizer( str, values );
			if ( tokenizer.result ) {
				return {
					value: tokenizer.result.v,
					remaining: tokenizer.remaining()
				};
			}
			return null;
		};
	}( parse_Tokenizer_utils_getStringMatch, parse_Tokenizer_utils_allowWhitespace, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral, parse_Tokenizer_getExpression_shared_getKey );

	var render_StringFragment_Interpolator = function( types, teardown, Mustache ) {

		var StringInterpolator = function( options ) {
			this.type = types.INTERPOLATOR;
			Mustache.init( this, options );
		};
		StringInterpolator.prototype = {
			update: Mustache.update,
			resolve: Mustache.resolve,
			reassign: Mustache.reassign,
			render: function( value ) {
				this.value = value;
				this.parentFragment.bubble();
			},
			teardown: function() {
				teardown( this );
			},
			toString: function() {
				if ( this.value == undefined ) {
					return '';
				}
				return stringify( this.value );
			}
		};
		return StringInterpolator;

		function stringify( value ) {
			if ( typeof value === 'string' ) {
				return value;
			}
			return JSON.stringify( value );
		}
	}( config_types, shared_teardown, render_shared_Mustache__Mustache );

	var render_StringFragment_Section = function( types, Mustache, updateSection, teardown, circular ) {

		var StringSection, StringFragment;
		circular.push( function() {
			StringFragment = circular.StringFragment;
		} );
		StringSection = function( options ) {
			this.type = types.SECTION;
			this.fragments = [];
			this.length = 0;
			Mustache.init( this, options );
		};
		StringSection.prototype = {
			update: Mustache.update,
			resolve: Mustache.resolve,
			reassign: Mustache.reassign,
			teardown: function() {
				this.teardownFragments();
				teardown( this );
			},
			teardownFragments: function() {
				while ( this.fragments.length ) {
					this.fragments.shift().teardown();
				}
				this.length = 0;
			},
			bubble: function() {
				this.value = this.fragments.join( '' );
				this.parentFragment.bubble();
			},
			render: function( value ) {
				var wrapped;
				// with sections, we need to get the fake value if we have a wrapped object
				if ( wrapped = this.root._wrapped[ this.keypath ] ) {
					value = wrapped.get();
				}
				updateSection( this, value );
				this.parentFragment.bubble();
			},
			createFragment: function( options ) {
				return new StringFragment( options );
			},
			toString: function() {
				return this.fragments.join( '' );
			}
		};
		return StringSection;
	}( config_types, render_shared_Mustache__Mustache, render_shared_updateSection, shared_teardown, circular );

	var render_StringFragment_Text = function( types ) {

		var StringText = function( text ) {
			this.type = types.TEXT;
			this.text = text;
		};
		StringText.prototype = {
			toString: function() {
				return this.text;
			},
			reassign: function() {},
			//no-op
			teardown: function() {}
		};
		return StringText;
	}( config_types );

	var render_StringFragment_prototype_toArgsList = function( warn, parseJSON ) {

		return function() {
			var values, counter, jsonesque, guid, errorMessage, parsed, processItems;
			if ( !this.argsList || this.dirty ) {
				values = {};
				counter = 0;
				guid = this.root._guid;
				processItems = function( items ) {
					return items.map( function( item ) {
						var placeholderId, wrapped, value;
						if ( item.text ) {
							return item.text;
						}
						if ( item.fragments ) {
							return item.fragments.map( function( fragment ) {
								return processItems( fragment.items );
							} ).join( '' );
						}
						placeholderId = guid + '-' + counter++;
						if ( wrapped = item.root._wrapped[ item.keypath ] ) {
							value = wrapped.value;
						} else {
							value = item.value;
						}
						values[ placeholderId ] = value;
						return '${' + placeholderId + '}';
					} ).join( '' );
				};
				jsonesque = processItems( this.items );
				parsed = parseJSON( '[' + jsonesque + ']', values );
				if ( !parsed ) {
					errorMessage = 'Could not parse directive arguments (' + this.toString() + '). If you think this is a bug, please file an issue at http://github.com/RactiveJS/Ractive/issues';
					if ( this.root.debug ) {
						throw new Error( errorMessage );
					} else {
						warn( errorMessage );
						this.argsList = [ jsonesque ];
					}
				} else {
					this.argsList = parsed.value;
				}
				this.dirty = false;
			}
			return this.argsList;
		};
	}( utils_warn, utils_parseJSON );

	var render_StringFragment__StringFragment = function( types, parseJSON, Fragment, Interpolator, Section, Text, toArgsList, circular ) {

		var StringFragment = function( options ) {
			Fragment.init( this, options );
		};
		StringFragment.prototype = {
			reassign: Fragment.reassign,
			createItem: function( options ) {
				if ( typeof options.descriptor === 'string' ) {
					return new Text( options.descriptor );
				}
				switch ( options.descriptor.t ) {
					case types.INTERPOLATOR:
						return new Interpolator( options );
					case types.TRIPLE:
						return new Interpolator( options );
					case types.SECTION:
						return new Section( options );
					default:
						throw 'Something went wrong in a rather interesting way';
				}
			},
			bubble: function() {
				this.dirty = true;
				this.owner.bubble();
			},
			teardown: function() {
				var numItems, i;
				numItems = this.items.length;
				for ( i = 0; i < numItems; i += 1 ) {
					this.items[ i ].teardown();
				}
			},
			getValue: function() {
				var value;
				// Accommodate boolean attributes
				if ( this.items.length === 1 && this.items[ 0 ].type === types.INTERPOLATOR ) {
					value = this.items[ 0 ].value;
					if ( value !== undefined ) {
						return value;
					}
				}
				return this.toString();
			},
			isSimple: function() {
				var i, item, containsInterpolator;
				if ( this.simple !== undefined ) {
					return this.simple;
				}
				i = this.items.length;
				while ( i-- ) {
					item = this.items[ i ];
					if ( item.type === types.TEXT ) {
						continue;
					}
					// we can only have one interpolator and still be self-updating
					if ( item.type === types.INTERPOLATOR ) {
						if ( containsInterpolator ) {
							return false;
						} else {
							containsInterpolator = true;
							continue;
						}
					}
					// anything that isn't text or an interpolator (i.e. a section)
					// and we can't self-update
					return this.simple = false;
				}
				return this.simple = true;
			},
			toString: function() {
				return this.items.join( '' );
			},
			toJSON: function() {
				var value = this.getValue(),
					parsed;
				if ( typeof value === 'string' ) {
					parsed = parseJSON( value );
					value = parsed ? parsed.value : value;
				}
				return value;
			},
			toArgsList: toArgsList
		};
		circular.StringFragment = StringFragment;
		return StringFragment;
	}( config_types, utils_parseJSON, render_shared_Fragment__Fragment, render_StringFragment_Interpolator, render_StringFragment_Section, render_StringFragment_Text, render_StringFragment_prototype_toArgsList, circular );

	var render_DomFragment_Attribute__Attribute = function( runloop, types, determineNameAndNamespace, setStaticAttribute, determinePropertyName, getInterpolator, bind, update, StringFragment ) {

		var DomAttribute = function( options ) {
			this.type = types.ATTRIBUTE;
			this.element = options.element;
			determineNameAndNamespace( this, options.name );
			// if it's an empty attribute, or just a straight key-value pair, with no
			// mustache shenanigans, set the attribute accordingly and go home
			if ( options.value === null || typeof options.value === 'string' ) {
				setStaticAttribute( this, options );
				return;
			}
			// otherwise we need to do some work
			this.root = options.root;
			this.pNode = options.pNode;
			// share parentFragment with parent element
			this.parentFragment = this.element.parentFragment;
			this.fragment = new StringFragment( {
				descriptor: options.value,
				root: this.root,
				owner: this
			} );
			// Store a reference to this attribute's interpolator, if its fragment
			// takes the form `{{foo}}`. This is necessary for two-way binding and
			// for correctly rendering HTML later
			this.interpolator = getInterpolator( this );
			// if we're not rendering (i.e. we're just stringifying), we can stop here
			if ( !this.pNode ) {
				return;
			}
			// special cases
			if ( this.name === 'value' ) {
				this.isValueAttribute = true;
				// TODO need to wait until afterwards to determine type, in case we
				// haven't initialised that attribute yet
				// <input type='file' value='{{value}}'>
				if ( this.pNode.tagName === 'INPUT' && this.pNode.type === 'file' ) {
					this.isFileInputValue = true;
				}
			}
			// can we establish this attribute's property name equivalent?
			determinePropertyName( this, options );
			// determine whether this attribute can be marked as self-updating
			this.selfUpdating = this.fragment.isSimple();
			// mark as ready
			this.ready = true;
		};
		DomAttribute.prototype = {
			bind: bind,
			update: update,
			updateBindings: function() {
				// if the fragment this attribute belongs to gets reassigned (as a result of
				// as section being updated via an array shift, unshift or splice), this
				// attribute needs to recognise that its keypath has changed
				this.keypath = this.interpolator.keypath || this.interpolator.ref;
				// if we encounter the special case described above, update the name attribute
				if ( this.propertyName === 'name' ) {
					// replace actual name attribute
					this.pNode.name = '{{' + this.keypath + '}}';
				}
			},
			reassign: function( indexRef, newIndex, oldKeypath, newKeypath ) {
				if ( this.fragment ) {
					this.fragment.reassign( indexRef, newIndex, oldKeypath, newKeypath );
					if ( this.twoway ) {
						this.updateBindings();
					}
				}
			},
			teardown: function() {
				var i;
				if ( this.boundEvents ) {
					i = this.boundEvents.length;
					while ( i-- ) {
						this.pNode.removeEventListener( this.boundEvents[ i ], this.updateModel, false );
					}
				}
				// ignore non-dynamic attributes
				if ( this.fragment ) {
					this.fragment.teardown();
				}
			},
			bubble: function() {
				// If an attribute's text fragment contains a single item, we can
				// update the DOM immediately...
				if ( this.selfUpdating ) {
					this.update();
				} else if ( !this.deferred && this.ready ) {
					runloop.addAttribute( this );
					this.deferred = true;
				}
			},
			toString: function() {
				var str, interpolator;
				if ( this.value === null ) {
					return this.name;
				}
				// Special case - select values (should not be stringified)
				if ( this.name === 'value' && this.element.lcName === 'select' ) {
					return;
				}
				// Special case - radio names
				if ( this.name === 'name' && this.element.lcName === 'input' && ( interpolator = this.interpolator ) ) {
					return 'name={{' + ( interpolator.keypath || interpolator.ref ) + '}}';
				}
				// TODO don't use JSON.stringify?
				if ( !this.fragment ) {
					return this.name + '=' + JSON.stringify( this.value );
				}
				// TODO deal with boolean attributes correctly
				str = this.fragment.toString();
				return this.name + '=' + JSON.stringify( str );
			}
		};
		return DomAttribute;
	}( global_runloop, config_types, render_DomFragment_Attribute_helpers_determineNameAndNamespace, render_DomFragment_Attribute_helpers_setStaticAttribute, render_DomFragment_Attribute_helpers_determinePropertyName, render_DomFragment_Attribute_helpers_getInterpolator, render_DomFragment_Attribute_prototype_bind, render_DomFragment_Attribute_prototype_update, render_StringFragment__StringFragment );

	var render_DomFragment_Element_initialise_createElementAttribute = function( Attribute ) {

		return function createElementAttribute( element, name, fragment ) {
			var attr = new Attribute( {
				element: element,
				name: name,
				value: fragment,
				root: element.root,
				pNode: element.node
			} );
			// store against both index and name, for fast iteration and lookup
			element.attributes.push( element.attributes[ name ] = attr );
			// The name attribute is a special case - it is the only two-way attribute that updates
			// the viewmodel based on the value of another attribute. For that reason it must wait
			// until the node has been initialised, and the viewmodel has had its first two-way
			// update, before updating itself (otherwise it may disable a checkbox or radio that
			// was enabled in the template)
			if ( name !== 'name' ) {
				attr.update();
			}
		};
	}( render_DomFragment_Attribute__Attribute );

	var render_DomFragment_Element_initialise_createElementAttributes = function( createElementAttribute ) {

		return function( element, attributes ) {
			var attrName;
			element.attributes = [];
			for ( attrName in attributes ) {
				if ( attributes.hasOwnProperty( attrName ) ) {
					createElementAttribute( element, attrName, attributes[ attrName ] );
				}
			}
			return element.attributes;
		};
	}( render_DomFragment_Element_initialise_createElementAttribute );

	var utils_toArray = function toArray( arrayLike ) {
		var array = [],
			i = arrayLike.length;
		while ( i-- ) {
			array[ i ] = arrayLike[ i ];
		}
		return array;
	};

	var render_DomFragment_Element_shared_getMatchingStaticNodes = function( toArray ) {

		return function getMatchingStaticNodes( element, selector ) {
			if ( !element.matchingStaticNodes[ selector ] ) {
				element.matchingStaticNodes[ selector ] = toArray( element.node.querySelectorAll( selector ) );
			}
			return element.matchingStaticNodes[ selector ];
		};
	}( utils_toArray );

	var render_DomFragment_Element_initialise_appendElementChildren = function( warn, namespaces, StringFragment, getMatchingStaticNodes, circular ) {

		var DomFragment, updateCss, updateScript;
		circular.push( function() {
			DomFragment = circular.DomFragment;
		} );
		updateCss = function() {
			var node = this.node,
				content = this.fragment.toString();
			if ( node.styleSheet ) {
				node.styleSheet.cssText = content;
			} else {
				node.innerHTML = content;
			}
		};
		updateScript = function() {
			if ( !this.node.type || this.node.type === 'text/javascript' ) {
				warn( 'Script tag was updated. This does not cause the code to be re-evaluated!' );
			}
			this.node.text = this.fragment.toString();
		};
		return function appendElementChildren( element, node, descriptor, docFrag ) {
			// Special case - script and style tags
			if ( element.lcName === 'script' || element.lcName === 'style' ) {
				element.fragment = new StringFragment( {
					descriptor: descriptor.f,
					root: element.root,
					owner: element
				} );
				if ( docFrag ) {
					if ( element.lcName === 'script' ) {
						element.bubble = updateScript;
						element.node.text = element.fragment.toString();
					} else {
						element.bubble = updateCss;
						element.bubble();
					}
				}
				return;
			}
			if ( typeof descriptor.f === 'string' && ( !node || ( !node.namespaceURI || node.namespaceURI === namespaces.html ) ) ) {
				// great! we can use innerHTML
				element.html = descriptor.f;
				if ( docFrag ) {
					node.innerHTML = element.html;
					// Update live queries, if applicable
					element.matchingStaticNodes = {};
					// so we can remove matches made with querySelectorAll at teardown time
					updateLiveQueries( element );
				}
			} else {
				element.fragment = new DomFragment( {
					descriptor: descriptor.f,
					root: element.root,
					pNode: node,
					owner: element,
					pElement: element
				} );
				if ( docFrag ) {
					node.appendChild( element.fragment.docFrag );
				}
			}
		};

		function updateLiveQueries( element ) {
			var instance, liveQueries, node, selector, query, matchingStaticNodes, i;
			node = element.node;
			instance = element.root;
			do {
				liveQueries = instance._liveQueries;
				i = liveQueries.length;
				while ( i-- ) {
					selector = liveQueries[ i ];
					query = liveQueries[ selector ];
					matchingStaticNodes = getMatchingStaticNodes( element, selector );
					query.push.apply( query, matchingStaticNodes );
				}
			} while ( instance = instance._parent );
		}
	}( utils_warn, config_namespaces, render_StringFragment__StringFragment, render_DomFragment_Element_shared_getMatchingStaticNodes, circular );

	var render_DomFragment_Element_initialise_decorate_Decorator = function( warn, StringFragment ) {

		var Decorator = function( descriptor, ractive, owner ) {
			var decorator = this,
				name, fragment, errorMessage;
			decorator.root = ractive;
			decorator.node = owner.node;
			name = descriptor.n || descriptor;
			if ( typeof name !== 'string' ) {
				fragment = new StringFragment( {
					descriptor: name,
					root: ractive,
					owner: owner
				} );
				name = fragment.toString();
				fragment.teardown();
			}
			if ( descriptor.a ) {
				decorator.params = descriptor.a;
			} else if ( descriptor.d ) {
				decorator.fragment = new StringFragment( {
					descriptor: descriptor.d,
					root: ractive,
					owner: owner
				} );
				decorator.params = decorator.fragment.toArgsList();
				decorator.fragment.bubble = function() {
					this.dirty = true;
					decorator.params = this.toArgsList();
					if ( decorator.ready ) {
						decorator.update();
					}
				};
			}
			decorator.fn = ractive.decorators[ name ];
			if ( !decorator.fn ) {
				errorMessage = 'Missing "' + name + '" decorator. You may need to download a plugin via http://docs.ractivejs.org/latest/plugins#decorators';
				if ( ractive.debug ) {
					throw new Error( errorMessage );
				} else {
					warn( errorMessage );
				}
			}
		};
		Decorator.prototype = {
			init: function() {
				var result, args;
				if ( this.params ) {
					args = [ this.node ].concat( this.params );
					result = this.fn.apply( this.root, args );
				} else {
					result = this.fn.call( this.root, this.node );
				}
				if ( !result || !result.teardown ) {
					throw new Error( 'Decorator definition must return an object with a teardown method' );
				}
				// TODO does this make sense?
				this.actual = result;
				this.ready = true;
			},
			update: function() {
				if ( this.actual.update ) {
					this.actual.update.apply( this.root, this.params );
				} else {
					this.actual.teardown( true );
					this.init();
				}
			},
			teardown: function( updating ) {
				this.actual.teardown();
				if ( !updating && this.fragment ) {
					this.fragment.teardown();
				}
			}
		};
		return Decorator;
	}( utils_warn, render_StringFragment__StringFragment );

	var render_DomFragment_Element_initialise_decorate__decorate = function( runloop, Decorator ) {

		return function( descriptor, root, owner ) {
			var decorator = new Decorator( descriptor, root, owner );
			if ( decorator.fn ) {
				owner.decorator = decorator;
				runloop.addDecorator( owner.decorator );
			}
		};
	}( global_runloop, render_DomFragment_Element_initialise_decorate_Decorator );

	var render_DomFragment_Element_initialise_addEventProxies_addEventProxy = function( warn, StringFragment ) {

		var addEventProxy,
			// helpers
			MasterEventHandler, ProxyEvent, firePlainEvent, fireEventWithArgs, fireEventWithDynamicArgs, customHandlers, genericHandler, getCustomHandler;
		addEventProxy = function( element, triggerEventName, proxyDescriptor, indexRefs ) {
			var events, master;
			events = element.node._ractive.events;
			master = events[ triggerEventName ] || ( events[ triggerEventName ] = new MasterEventHandler( element, triggerEventName, indexRefs ) );
			master.add( proxyDescriptor );
		};
		MasterEventHandler = function( element, eventName ) {
			var definition;
			this.element = element;
			this.root = element.root;
			this.node = element.node;
			this.name = eventName;
			this.proxies = [];
			if ( definition = this.root.events[ eventName ] ) {
				this.custom = definition( this.node, getCustomHandler( eventName ) );
			} else {
				// Looks like we're dealing with a standard DOM event... but let's check
				if ( !( 'on' + eventName in this.node ) ) {
					warn( 'Missing "' + this.name + '" event. You may need to download a plugin via http://docs.ractivejs.org/latest/plugins#events' );
				}
				this.node.addEventListener( eventName, genericHandler, false );
			}
		};
		MasterEventHandler.prototype = {
			add: function( proxy ) {
				this.proxies.push( new ProxyEvent( this.element, this.root, proxy ) );
			},
			// TODO teardown when element torn down
			teardown: function() {
				var i;
				if ( this.custom ) {
					this.custom.teardown();
				} else {
					this.node.removeEventListener( this.name, genericHandler, false );
				}
				i = this.proxies.length;
				while ( i-- ) {
					this.proxies[ i ].teardown();
				}
			},
			fire: function( event ) {
				var i = this.proxies.length;
				while ( i-- ) {
					this.proxies[ i ].fire( event );
				}
			}
		};
		ProxyEvent = function( element, ractive, descriptor ) {
			var name;
			this.root = ractive;
			name = descriptor.n || descriptor;
			if ( typeof name === 'string' ) {
				this.n = name;
			} else {
				this.n = new StringFragment( {
					descriptor: descriptor.n,
					root: this.root,
					owner: element
				} );
			}
			if ( descriptor.a ) {
				this.a = descriptor.a;
				this.fire = fireEventWithArgs;
				return;
			}
			if ( descriptor.d ) {
				this.d = new StringFragment( {
					descriptor: descriptor.d,
					root: this.root,
					owner: element
				} );
				this.fire = fireEventWithDynamicArgs;
				return;
			}
			this.fire = firePlainEvent;
		};
		ProxyEvent.prototype = {
			teardown: function() {
				if ( this.n.teardown ) {
					this.n.teardown();
				}
				if ( this.d ) {
					this.d.teardown();
				}
			},
			bubble: function() {}
		};
		// the ProxyEvent instance fire method could be any of these
		firePlainEvent = function( event ) {
			this.root.fire( this.n.toString(), event );
		};
		fireEventWithArgs = function( event ) {
			this.root.fire.apply( this.root, [
				this.n.toString(),
				event
			].concat( this.a ) );
		};
		fireEventWithDynamicArgs = function( event ) {
			var args = this.d.toArgsList();
			// need to strip [] from ends if a string!
			if ( typeof args === 'string' ) {
				args = args.substr( 1, args.length - 2 );
			}
			this.root.fire.apply( this.root, [
				this.n.toString(),
				event
			].concat( args ) );
		};
		// all native DOM events dealt with by Ractive share a single handler
		genericHandler = function( event ) {
			var storage = this._ractive;
			storage.events[ event.type ].fire( {
				node: this,
				original: event,
				index: storage.index,
				keypath: storage.keypath,
				context: storage.root.get( storage.keypath )
			} );
		};
		customHandlers = {};
		getCustomHandler = function( eventName ) {
			if ( customHandlers[ eventName ] ) {
				return customHandlers[ eventName ];
			}
			return customHandlers[ eventName ] = function( event ) {
				var storage = event.node._ractive;
				event.index = storage.index;
				event.keypath = storage.keypath;
				event.context = storage.root.get( storage.keypath );
				storage.events[ eventName ].fire( event );
			};
		};
		return addEventProxy;
	}( utils_warn, render_StringFragment__StringFragment );

	var render_DomFragment_Element_initialise_addEventProxies__addEventProxies = function( addEventProxy ) {

		return function( element, proxies ) {
			var i, eventName, eventNames;
			for ( eventName in proxies ) {
				if ( proxies.hasOwnProperty( eventName ) ) {
					eventNames = eventName.split( '-' );
					i = eventNames.length;
					while ( i-- ) {
						addEventProxy( element, eventNames[ i ], proxies[ eventName ] );
					}
				}
			}
		};
	}( render_DomFragment_Element_initialise_addEventProxies_addEventProxy );

	var render_DomFragment_Element_initialise_updateLiveQueries = function( element ) {
		var instance, liveQueries, i, selector, query;
		// Does this need to be added to any live queries?
		instance = element.root;
		do {
			liveQueries = instance._liveQueries;
			i = liveQueries.length;
			while ( i-- ) {
				selector = liveQueries[ i ];
				query = liveQueries[ selector ];
				if ( query._test( element ) ) {
					// keep register of applicable selectors, for when we teardown
					( element.liveQueries || ( element.liveQueries = [] ) ).push( query );
				}
			}
		} while ( instance = instance._parent );
	};

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_init = function() {
		if ( this._inited ) {
			throw new Error( 'Cannot initialize a transition more than once' );
		}
		this._inited = true;
		this._fn.apply( this.root, [ this ].concat( this.params ) );
	};

	var render_DomFragment_Element_shared_executeTransition_Transition_helpers_prefix = function( isClient, vendors, createElement ) {

		var prefixCache, testStyle;
		if ( !isClient ) {
			return;
		}
		prefixCache = {};
		testStyle = createElement( 'div' ).style;
		return function( prop ) {
			var i, vendor, capped;
			if ( !prefixCache[ prop ] ) {
				if ( testStyle[ prop ] !== undefined ) {
					prefixCache[ prop ] = prop;
				} else {
					// test vendors...
					capped = prop.charAt( 0 ).toUpperCase() + prop.substring( 1 );
					i = vendors.length;
					while ( i-- ) {
						vendor = vendors[ i ];
						if ( testStyle[ vendor + capped ] !== undefined ) {
							prefixCache[ prop ] = vendor + capped;
							break;
						}
					}
				}
			}
			return prefixCache[ prop ];
		};
	}( config_isClient, config_vendors, utils_createElement );

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_getStyle = function( legacy, isClient, isArray, prefix ) {

		var getComputedStyle;
		if ( !isClient ) {
			return;
		}
		getComputedStyle = window.getComputedStyle || legacy.getComputedStyle;
		return function( props ) {
			var computedStyle, styles, i, prop, value;
			computedStyle = window.getComputedStyle( this.node );
			if ( typeof props === 'string' ) {
				value = computedStyle[ prefix( props ) ];
				if ( value === '0px' ) {
					value = 0;
				}
				return value;
			}
			if ( !isArray( props ) ) {
				throw new Error( 'Transition#getStyle must be passed a string, or an array of strings representing CSS properties' );
			}
			styles = {};
			i = props.length;
			while ( i-- ) {
				prop = props[ i ];
				value = computedStyle[ prefix( prop ) ];
				if ( value === '0px' ) {
					value = 0;
				}
				styles[ prop ] = value;
			}
			return styles;
		};
	}( legacy, config_isClient, utils_isArray, render_DomFragment_Element_shared_executeTransition_Transition_helpers_prefix );

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_setStyle = function( prefix ) {

		return function( style, value ) {
			var prop;
			if ( typeof style === 'string' ) {
				this.node.style[ prefix( style ) ] = value;
			} else {
				for ( prop in style ) {
					if ( style.hasOwnProperty( prop ) ) {
						this.node.style[ prefix( prop ) ] = style[ prop ];
					}
				}
			}
			return this;
		};
	}( render_DomFragment_Element_shared_executeTransition_Transition_helpers_prefix );

	var utils_camelCase = function( hyphenatedStr ) {
		return hyphenatedStr.replace( /-([a-zA-Z])/g, function( match, $1 ) {
			return $1.toUpperCase();
		} );
	};

	var shared_Ticker = function( warn, getTime, animations ) {

		// TODO what happens if a transition is aborted?
		// TODO use this with Animation to dedupe some code?
		var Ticker = function( options ) {
			var easing;
			this.duration = options.duration;
			this.step = options.step;
			this.complete = options.complete;
			// easing
			if ( typeof options.easing === 'string' ) {
				easing = options.root.easing[ options.easing ];
				if ( !easing ) {
					warn( 'Missing easing function ("' + options.easing + '"). You may need to download a plugin from [TODO]' );
					easing = linear;
				}
			} else if ( typeof options.easing === 'function' ) {
				easing = options.easing;
			} else {
				easing = linear;
			}
			this.easing = easing;
			this.start = getTime();
			this.end = this.start + this.duration;
			this.running = true;
			animations.add( this );
		};
		Ticker.prototype = {
			tick: function( now ) {
				var elapsed, eased;
				if ( !this.running ) {
					return false;
				}
				if ( now > this.end ) {
					if ( this.step ) {
						this.step( 1 );
					}
					if ( this.complete ) {
						this.complete( 1 );
					}
					return false;
				}
				elapsed = now - this.start;
				eased = this.easing( elapsed / this.duration );
				if ( this.step ) {
					this.step( eased );
				}
				return true;
			},
			stop: function() {
				if ( this.abort ) {
					this.abort();
				}
				this.running = false;
			}
		};
		return Ticker;

		function linear( t ) {
			return t;
		}
	}( utils_warn, utils_getTime, shared_animations );

	var render_DomFragment_Element_shared_executeTransition_Transition_helpers_unprefix = function( vendors ) {

		var unprefixPattern = new RegExp( '^-(?:' + vendors.join( '|' ) + ')-' );
		return function( prop ) {
			return prop.replace( unprefixPattern, '' );
		};
	}( config_vendors );

	var render_DomFragment_Element_shared_executeTransition_Transition_helpers_hyphenate = function( vendors ) {

		var vendorPattern = new RegExp( '^(?:' + vendors.join( '|' ) + ')([A-Z])' );
		return function( str ) {
			var hyphenated;
			if ( !str ) {
				return '';
			}
			if ( vendorPattern.test( str ) ) {
				str = '-' + str;
			}
			hyphenated = str.replace( /[A-Z]/g, function( match ) {
				return '-' + match.toLowerCase();
			} );
			return hyphenated;
		};
	}( config_vendors );

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_animateStyle_createTransitions = function( isClient, warn, createElement, camelCase, interpolate, Ticker, prefix, unprefix, hyphenate ) {

		var testStyle, TRANSITION, TRANSITIONEND, CSS_TRANSITIONS_ENABLED, TRANSITION_DURATION, TRANSITION_PROPERTY, TRANSITION_TIMING_FUNCTION, canUseCssTransitions = {}, cannotUseCssTransitions = {};
		if ( !isClient ) {
			return;
		}
		testStyle = createElement( 'div' ).style;
		// determine some facts about our environment
		( function() {
			if ( testStyle.transition !== undefined ) {
				TRANSITION = 'transition';
				TRANSITIONEND = 'transitionend';
				CSS_TRANSITIONS_ENABLED = true;
			} else if ( testStyle.webkitTransition !== undefined ) {
				TRANSITION = 'webkitTransition';
				TRANSITIONEND = 'webkitTransitionEnd';
				CSS_TRANSITIONS_ENABLED = true;
			} else {
				CSS_TRANSITIONS_ENABLED = false;
			}
		}() );
		if ( TRANSITION ) {
			TRANSITION_DURATION = TRANSITION + 'Duration';
			TRANSITION_PROPERTY = TRANSITION + 'Property';
			TRANSITION_TIMING_FUNCTION = TRANSITION + 'TimingFunction';
		}
		return function( t, to, options, changedProperties, transitionEndHandler, resolve ) {
			// Wait a beat (otherwise the target styles will be applied immediately)
			// TODO use a fastdom-style mechanism?
			setTimeout( function() {
				var hashPrefix, jsTransitionsComplete, cssTransitionsComplete, checkComplete;
				checkComplete = function() {
					if ( jsTransitionsComplete && cssTransitionsComplete ) {
						resolve();
					}
				};
				// this is used to keep track of which elements can use CSS to animate
				// which properties
				hashPrefix = t.node.namespaceURI + t.node.tagName;
				t.node.style[ TRANSITION_PROPERTY ] = changedProperties.map( prefix ).map( hyphenate ).join( ',' );
				t.node.style[ TRANSITION_TIMING_FUNCTION ] = hyphenate( options.easing || 'linear' );
				t.node.style[ TRANSITION_DURATION ] = options.duration / 1000 + 's';
				transitionEndHandler = function( event ) {
					var index;
					index = changedProperties.indexOf( camelCase( unprefix( event.propertyName ) ) );
					if ( index !== -1 ) {
						changedProperties.splice( index, 1 );
					}
					if ( changedProperties.length ) {
						// still transitioning...
						return;
					}
					t.root.fire( t.name + ':end' );
					t.node.removeEventListener( TRANSITIONEND, transitionEndHandler, false );
					cssTransitionsComplete = true;
					checkComplete();
				};
				t.node.addEventListener( TRANSITIONEND, transitionEndHandler, false );
				setTimeout( function() {
					var i = changedProperties.length,
						hash, originalValue, index, propertiesToTransitionInJs = [],
						prop;
					while ( i-- ) {
						prop = changedProperties[ i ];
						hash = hashPrefix + prop;
						if ( canUseCssTransitions[ hash ] ) {
							// We can definitely use CSS transitions, because
							// we've already tried it and it worked
							t.node.style[ prefix( prop ) ] = to[ prop ];
						} else {
							// one way or another, we'll need this
							originalValue = t.getStyle( prop );
						}
						if ( canUseCssTransitions[ hash ] === undefined ) {
							// We're not yet sure if we can use CSS transitions -
							// let's find out
							t.node.style[ prefix( prop ) ] = to[ prop ];
							// if this property is transitionable in this browser,
							// the current style will be different from the target style
							canUseCssTransitions[ hash ] = t.getStyle( prop ) != to[ prop ];
							cannotUseCssTransitions[ hash ] = !canUseCssTransitions[ hash ];
						}
						if ( cannotUseCssTransitions[ hash ] ) {
							// we need to fall back to timer-based stuff
							// need to remove this from changedProperties, otherwise transitionEndHandler
							// will get confused
							index = changedProperties.indexOf( prop );
							if ( index === -1 ) {
								warn( 'Something very strange happened with transitions. If you see this message, please let @RactiveJS know. Thanks!' );
							} else {
								changedProperties.splice( index, 1 );
							}
							// TODO Determine whether this property is animatable at all
							// for now assume it is. First, we need to set the value to what it was...
							t.node.style[ prefix( prop ) ] = originalValue;
							// ...then kick off a timer-based transition
							propertiesToTransitionInJs.push( {
								name: prefix( prop ),
								interpolator: interpolate( originalValue, to[ prop ] )
							} );
						}
					}
					// javascript transitions
					if ( propertiesToTransitionInJs.length ) {
						new Ticker( {
							root: t.root,
							duration: options.duration,
							easing: camelCase( options.easing ),
							step: function( pos ) {
								var prop, i;
								i = propertiesToTransitionInJs.length;
								while ( i-- ) {
									prop = propertiesToTransitionInJs[ i ];
									t.node.style[ prop.name ] = prop.interpolator( pos );
								}
							},
							complete: function() {
								jsTransitionsComplete = true;
								checkComplete();
							}
						} );
					} else {
						jsTransitionsComplete = true;
					}
					if ( !changedProperties.length ) {
						// We need to cancel the transitionEndHandler, and deal with
						// the fact that it will never fire
						t.node.removeEventListener( TRANSITIONEND, transitionEndHandler, false );
						cssTransitionsComplete = true;
						checkComplete();
					}
				}, 0 );
			}, options.delay || 0 );
		};
	}( config_isClient, utils_warn, utils_createElement, utils_camelCase, shared_interpolate, shared_Ticker, render_DomFragment_Element_shared_executeTransition_Transition_helpers_prefix, render_DomFragment_Element_shared_executeTransition_Transition_helpers_unprefix, render_DomFragment_Element_shared_executeTransition_Transition_helpers_hyphenate );

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_animateStyle__animateStyle = function( legacy, isClient, warn, Promise, prefix, createTransitions ) {

		var getComputedStyle;
		if ( !isClient ) {
			return;
		}
		getComputedStyle = window.getComputedStyle || legacy.getComputedStyle;
		return function( style, value, options, complete ) {
			var t = this,
				to;
			if ( typeof style === 'string' ) {
				to = {};
				to[ style ] = value;
			} else {
				to = style;
				// shuffle arguments
				complete = options;
				options = value;
			}
			// As of 0.3.9, transition authors should supply an `option` object with
			// `duration` and `easing` properties (and optional `delay`), plus a
			// callback function that gets called after the animation completes
			// TODO remove this check in a future version
			if ( !options ) {
				warn( 'The "' + t.name + '" transition does not supply an options object to `t.animateStyle()`. This will break in a future version of Ractive. For more info see https://github.com/RactiveJS/Ractive/issues/340' );
				options = t;
				complete = t.complete;
			}
			var promise = new Promise( function( resolve ) {
				var propertyNames, changedProperties, computedStyle, current, from, transitionEndHandler, i, prop;
				// Edge case - if duration is zero, set style synchronously and complete
				if ( !options.duration ) {
					t.setStyle( to );
					resolve();
					return;
				}
				// Get a list of the properties we're animating
				propertyNames = Object.keys( to );
				changedProperties = [];
				// Store the current styles
				computedStyle = window.getComputedStyle( t.node );
				from = {};
				i = propertyNames.length;
				while ( i-- ) {
					prop = propertyNames[ i ];
					current = computedStyle[ prefix( prop ) ];
					if ( current === '0px' ) {
						current = 0;
					}
					// we need to know if we're actually changing anything
					if ( current != to[ prop ] ) {
						// use != instead of !==, so we can compare strings with numbers
						changedProperties.push( prop );
						// make the computed style explicit, so we can animate where
						// e.g. height='auto'
						t.node.style[ prefix( prop ) ] = current;
					}
				}
				// If we're not actually changing anything, the transitionend event
				// will never fire! So we complete early
				if ( !changedProperties.length ) {
					resolve();
					return;
				}
				createTransitions( t, to, options, changedProperties, transitionEndHandler, resolve );
			} );
			// If a callback was supplied, do the honours
			// TODO remove this check in future
			if ( complete ) {
				warn( 't.animateStyle returns a Promise as of 0.4.0. Transition authors should do t.animateStyle(...).then(callback)' );
				promise.then( complete );
			}
			return promise;
		};
	}( legacy, config_isClient, utils_warn, utils_Promise, render_DomFragment_Element_shared_executeTransition_Transition_helpers_prefix, render_DomFragment_Element_shared_executeTransition_Transition_prototype_animateStyle_createTransitions );

	var utils_fillGaps = function( target, source ) {
		var key;
		for ( key in source ) {
			if ( source.hasOwnProperty( key ) && !( key in target ) ) {
				target[ key ] = source[ key ];
			}
		}
		return target;
	};

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_processParams = function( fillGaps ) {

		return function( params, defaults ) {
			if ( typeof params === 'number' ) {
				params = {
					duration: params
				};
			} else if ( typeof params === 'string' ) {
				if ( params === 'slow' ) {
					params = {
						duration: 600
					};
				} else if ( params === 'fast' ) {
					params = {
						duration: 200
					};
				} else {
					params = {
						duration: 400
					};
				}
			} else if ( !params ) {
				params = {};
			}
			return fillGaps( params, defaults );
		};
	}( utils_fillGaps );

	var render_DomFragment_Element_shared_executeTransition_Transition_prototype_resetStyle = function() {
		if ( this.originalStyle ) {
			this.node.setAttribute( 'style', this.originalStyle );
		} else {
			// Next line is necessary, to remove empty style attribute!
			// See http://stackoverflow.com/a/7167553
			this.node.getAttribute( 'style' );
			this.node.removeAttribute( 'style' );
		}
	};

	var render_DomFragment_Element_shared_executeTransition_Transition__Transition = function( warn, StringFragment, init, getStyle, setStyle, animateStyle, processParams, resetStyle ) {

		var Transition;
		Transition = function( descriptor, root, owner, isIntro ) {
			var t = this,
				name, fragment, errorMessage;
			this.root = root;
			this.node = owner.node;
			this.isIntro = isIntro;
			// store original style attribute
			this.originalStyle = this.node.getAttribute( 'style' );
			// create t.complete() - we don't want this on the prototype,
			// because we don't want `this` silliness when passing it as
			// an argument
			t.complete = function( noReset ) {
				if ( !noReset && t.isIntro ) {
					t.resetStyle();
				}
				t.node._ractive.transition = null;
				t._manager.remove( t );
			};
			name = descriptor.n || descriptor;
			if ( typeof name !== 'string' ) {
				fragment = new StringFragment( {
					descriptor: name,
					root: this.root,
					owner: owner
				} );
				name = fragment.toString();
				fragment.teardown();
			}
			this.name = name;
			if ( descriptor.a ) {
				this.params = descriptor.a;
			} else if ( descriptor.d ) {
				// TODO is there a way to interpret dynamic arguments without all the
				// 'dependency thrashing'?
				fragment = new StringFragment( {
					descriptor: descriptor.d,
					root: this.root,
					owner: owner
				} );
				this.params = fragment.toArgsList();
				fragment.teardown();
			}
			this._fn = root.transitions[ name ];
			if ( !this._fn ) {
				errorMessage = 'Missing "' + name + '" transition. You may need to download a plugin via http://docs.ractivejs.org/latest/plugins#transitions';
				if ( root.debug ) {
					throw new Error( errorMessage );
				} else {
					warn( errorMessage );
				}
				return;
			}
		};
		Transition.prototype = {
			init: init,
			getStyle: getStyle,
			setStyle: setStyle,
			animateStyle: animateStyle,
			processParams: processParams,
			resetStyle: resetStyle
		};
		return Transition;
	}( utils_warn, render_StringFragment__StringFragment, render_DomFragment_Element_shared_executeTransition_Transition_prototype_init, render_DomFragment_Element_shared_executeTransition_Transition_prototype_getStyle, render_DomFragment_Element_shared_executeTransition_Transition_prototype_setStyle, render_DomFragment_Element_shared_executeTransition_Transition_prototype_animateStyle__animateStyle, render_DomFragment_Element_shared_executeTransition_Transition_prototype_processParams, render_DomFragment_Element_shared_executeTransition_Transition_prototype_resetStyle );

	var render_DomFragment_Element_shared_executeTransition__executeTransition = function( runloop, Transition ) {

		return function( descriptor, ractive, owner, isIntro ) {
			var transition, node, oldTransition;
			// TODO this can't be right!
			if ( !ractive.transitionsEnabled || ractive._parent && !ractive._parent.transitionsEnabled ) {
				return;
			}
			// get transition name, args and function
			transition = new Transition( descriptor, ractive, owner, isIntro );
			if ( transition._fn ) {
				node = transition.node;
				// Existing transition (i.e. we're outroing before intro is complete)?
				// End it prematurely
				if ( oldTransition = node._ractive.transition ) {
					oldTransition.complete();
				}
				node._ractive.transition = transition;
				runloop.addTransition( transition );
			}
		};
	}( global_runloop, render_DomFragment_Element_shared_executeTransition_Transition__Transition );

	var render_DomFragment_Element_initialise__initialise = function( runloop, types, namespaces, create, defineProperty, warn, createElement, getInnerContext, getElementNamespace, createElementAttribute, createElementAttributes, appendElementChildren, decorate, addEventProxies, updateLiveQueries, executeTransition, enforceCase ) {

		return function initialiseElement( element, options, docFrag ) {
			var parentFragment, pNode, descriptor, namespace, name, attributes, width, height, loadHandler, root, selectBinding, errorMessage;
			element.type = types.ELEMENT;
			// stuff we'll need later
			parentFragment = element.parentFragment = options.parentFragment;
			pNode = parentFragment.pNode;
			descriptor = element.descriptor = options.descriptor;
			element.parent = options.pElement;
			element.root = root = parentFragment.root;
			element.index = options.index;
			element.lcName = descriptor.e.toLowerCase();
			element.eventListeners = [];
			element.customEventListeners = [];
			element.cssDetachQueue = [];
			// get namespace, if we're actually rendering (not server-side stringifying)
			if ( pNode ) {
				namespace = element.namespace = getElementNamespace( descriptor, pNode );
				// non-HTML elements (i.e. SVG) are case-sensitive
				name = namespace !== namespaces.html ? enforceCase( descriptor.e ) : descriptor.e;
				// create the DOM node
				element.node = createElement( name, namespace );
				// Is this a top-level node of a component? If so, we may need to add
				// a data-rvcguid attribute, for CSS encapsulation
				if ( root.css && pNode === root.el ) {
					element.node.setAttribute( 'data-rvcguid', root.constructor._guid || root._guid );
				}
				// Add _ractive property to the node - we use this object to store stuff
				// related to proxy events, two-way bindings etc
				defineProperty( element.node, '_ractive', {
					value: {
						proxy: element,
						keypath: getInnerContext( parentFragment ),
						index: parentFragment.indexRefs,
						events: create( null ),
						root: root
					}
				} );
			}
			// set attributes
			attributes = createElementAttributes( element, descriptor.a );
			// append children, if there are any
			if ( descriptor.f ) {
				// Special case - contenteditable
				if ( element.node && element.node.getAttribute( 'contenteditable' ) ) {
					if ( element.node.innerHTML ) {
						// This is illegal. You can't have content inside a contenteditable
						// element that's already populated
						errorMessage = 'A pre-populated contenteditable element should not have children';
						if ( root.debug ) {
							throw new Error( errorMessage );
						} else {
							warn( errorMessage );
						}
					}
				}
				appendElementChildren( element, element.node, descriptor, docFrag );
			}
			// create event proxies
			if ( docFrag && descriptor.v ) {
				addEventProxies( element, descriptor.v );
			}
			// if we're actually rendering (i.e. not server-side stringifying), proceed
			if ( docFrag ) {
				// deal with two-way bindings
				if ( root.twoway ) {
					element.bind();
					// Special case - contenteditable
					if ( element.node.getAttribute( 'contenteditable' ) && element.node._ractive.binding ) {
						// We need to update the model
						element.node._ractive.binding.update();
					}
				}
				// name attributes are deferred, because they're a special case - if two-way
				// binding is involved they need to update later. But if it turns out they're
				// not two-way we can update them now
				if ( attributes.name && !attributes.name.twoway ) {
					attributes.name.update();
				}
				// if this is an <img>, and we're in a crap browser, we may need to prevent it
				// from overriding width and height when it loads the src
				if ( element.node.tagName === 'IMG' && ( ( width = element.attributes.width ) || ( height = element.attributes.height ) ) ) {
					element.node.addEventListener( 'load', loadHandler = function() {
						if ( width ) {
							element.node.width = width.value;
						}
						if ( height ) {
							element.node.height = height.value;
						}
						element.node.removeEventListener( 'load', loadHandler, false );
					}, false );
				}
				docFrag.appendChild( element.node );
				// apply decorator(s)
				if ( descriptor.o ) {
					decorate( descriptor.o, root, element );
				}
				// trigger intro transition
				if ( descriptor.t1 ) {
					executeTransition( descriptor.t1, root, element, true );
				}
				if ( element.node.tagName === 'OPTION' ) {
					// Special case... if this option's parent select was previously
					// empty, it's possible that it should initialise to the value of
					// this option.
					if ( pNode.tagName === 'SELECT' && ( selectBinding = pNode._ractive.binding ) ) {
						// it should be!
						selectBinding.deferUpdate();
					}
					// If a value attribute was not given, we need to create one based on
					// the content of the node, so that `<option>foo</option>` behaves the
					// same as `<option value='foo'>foo</option>` with two-way binding
					if ( !attributes.value ) {
						createElementAttribute( element, 'value', descriptor.f );
					}
					// Special case... a select may have had its value set before a matching
					// option was rendered. This might be that option element
					if ( element.node._ractive.value == pNode._ractive.value ) {
						element.node.selected = true;
					}
				}
				if ( element.node.autofocus ) {
					// Special case. Some browsers (*cough* Firefix *cough*) have a problem
					// with dynamically-generated elements having autofocus, and they won't
					// allow you to programmatically focus the element until it's in the DOM
					runloop.focus( element.node );
				}
			}
			// If this is an option element, we need to store a reference to its select
			if ( element.lcName === 'option' ) {
				element.select = findParentSelect( element.parent );
			}
			updateLiveQueries( element );
		};

		function findParentSelect( element ) {
			do {
				if ( element.lcName === 'select' ) {
					return element;
				}
			} while ( element = element.parent );
		}
	}( global_runloop, config_types, config_namespaces, utils_create, utils_defineProperty, utils_warn, utils_createElement, shared_getInnerContext, render_DomFragment_Element_initialise_getElementNamespace, render_DomFragment_Element_initialise_createElementAttribute, render_DomFragment_Element_initialise_createElementAttributes, render_DomFragment_Element_initialise_appendElementChildren, render_DomFragment_Element_initialise_decorate__decorate, render_DomFragment_Element_initialise_addEventProxies__addEventProxies, render_DomFragment_Element_initialise_updateLiveQueries, render_DomFragment_Element_shared_executeTransition__executeTransition, render_DomFragment_shared_enforceCase );

	var render_DomFragment_Element_prototype_teardown = function( runloop, executeTransition ) {

		return function Element_prototype_teardown( destroy ) {
			var eventName, binding, bindings;
			// Detach as soon as we can
			if ( destroy ) {
				this.willDetach = true;
				runloop.detachWhenReady( this );
			}
			// Children first. that way, any transitions on child elements will be
			// handled by the current transitionManager
			if ( this.fragment ) {
				this.fragment.teardown( false );
			}
			while ( this.attributes.length ) {
				this.attributes.pop().teardown();
			}
			if ( this.node ) {
				for ( eventName in this.node._ractive.events ) {
					this.node._ractive.events[ eventName ].teardown();
				}
				// tear down two-way binding, if such there be
				if ( binding = this.node._ractive.binding ) {
					binding.teardown();
					bindings = this.root._twowayBindings[ binding.attr.keypath ];
					bindings.splice( bindings.indexOf( binding ), 1 );
				}
			}
			if ( this.decorator ) {
				this.decorator.teardown();
			}
			// Outro, if necessary
			if ( this.descriptor.t2 ) {
				executeTransition( this.descriptor.t2, this.root, this, false );
			}
			// Remove this node from any live queries
			if ( this.liveQueries ) {
				removeFromLiveQueries( this );
			}
		};

		function removeFromLiveQueries( element ) {
			var query, selector, matchingStaticNodes, i, j;
			i = element.liveQueries.length;
			while ( i-- ) {
				query = element.liveQueries[ i ];
				selector = query.selector;
				query._remove( element.node );
				if ( element.matchingStaticNodes && ( matchingStaticNodes = element.matchingStaticNodes[ selector ] ) ) {
					j = matchingStaticNodes.length;
					while ( j-- ) {
						query.remove( matchingStaticNodes[ j ] );
					}
				}
			}
		}
	}( global_runloop, render_DomFragment_Element_shared_executeTransition__executeTransition );

	var render_DomFragment_Element_prototype_reassign = function( assignNewKeypath ) {

		return function reassignElement( indexRef, newIndex, oldKeypath, newKeypath ) {
			var i, storage, masterEventName, proxies, proxy, binding, bindings, liveQueries, ractive;
			i = this.attributes.length;
			while ( i-- ) {
				this.attributes[ i ].reassign( indexRef, newIndex, oldKeypath, newKeypath );
			}
			if ( storage = this.node._ractive ) {
				//adjust keypath if needed
				assignNewKeypath( storage, 'keypath', oldKeypath, newKeypath );
				if ( indexRef != undefined ) {
					storage.index[ indexRef ] = newIndex;
				}
				for ( masterEventName in storage.events ) {
					proxies = storage.events[ masterEventName ].proxies;
					i = proxies.length;
					while ( i-- ) {
						proxy = proxies[ i ];
						if ( typeof proxy.n === 'object' ) {
							proxy.a.reassign( indexRef, newIndex, oldKeypath, newKeypath );
						}
						if ( proxy.d ) {
							proxy.d.reassign( indexRef, newIndex, oldKeypath, newKeypath );
						}
					}
				}
				if ( binding = storage.binding ) {
					if ( binding.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
						bindings = storage.root._twowayBindings[ binding.keypath ];
						// remove binding reference for old keypath
						bindings.splice( bindings.indexOf( binding ), 1 );
						// update keypath
						binding.keypath = binding.keypath.replace( oldKeypath, newKeypath );
						// add binding reference for new keypath
						bindings = storage.root._twowayBindings[ binding.keypath ] || ( storage.root._twowayBindings[ binding.keypath ] = [] );
						bindings.push( binding );
					}
				}
			}
			// reassign children
			if ( this.fragment ) {
				this.fragment.reassign( indexRef, newIndex, oldKeypath, newKeypath );
			}
			// Update live queries, if necessary
			if ( liveQueries = this.liveQueries ) {
				ractive = this.root;
				i = liveQueries.length;
				while ( i-- ) {
					liveQueries[ i ]._makeDirty();
				}
			}
		};
	}( render_shared_utils_assignNewKeypath );

	var config_voidElementNames = 'area base br col command doctype embed hr img input keygen link meta param source track wbr'.split( ' ' );

	var render_DomFragment_Element_prototype_toString = function( voidElementNames, isArray ) {

		return function() {
			var str, i, len, attrStr;
			str = '<' + ( this.descriptor.y ? '!doctype' : this.descriptor.e );
			len = this.attributes.length;
			for ( i = 0; i < len; i += 1 ) {
				if ( attrStr = this.attributes[ i ].toString() ) {
					str += ' ' + attrStr;
				}
			}
			// Special case - selected options
			if ( this.lcName === 'option' && optionIsSelected( this ) ) {
				str += ' selected';
			}
			// Special case - two-way radio name bindings
			if ( this.lcName === 'input' && inputIsCheckedRadio( this ) ) {
				str += ' checked';
			}
			str += '>';
			if ( this.html ) {
				str += this.html;
			} else if ( this.fragment ) {
				str += this.fragment.toString();
			}
			// add a closing tag if this isn't a void element
			if ( voidElementNames.indexOf( this.descriptor.e ) === -1 ) {
				str += '</' + this.descriptor.e + '>';
			}
			this.stringifying = false;
			return str;
		};

		function optionIsSelected( element ) {
			var optionValue, selectValueAttribute, selectValueInterpolator, selectValue, i;
			optionValue = element.attributes.value.value;
			selectValueAttribute = element.select.attributes.value;
			selectValueInterpolator = selectValueAttribute.interpolator;
			if ( !selectValueInterpolator ) {
				return;
			}
			selectValue = element.root.get( selectValueInterpolator.keypath || selectValueInterpolator.ref );
			if ( selectValue == optionValue ) {
				return true;
			}
			if ( element.select.attributes.multiple && isArray( selectValue ) ) {
				i = selectValue.length;
				while ( i-- ) {
					if ( selectValue[ i ] == optionValue ) {
						return true;
					}
				}
			}
		}

		function inputIsCheckedRadio( element ) {
			var attributes, typeAttribute, valueAttribute, nameAttribute;
			attributes = element.attributes;
			typeAttribute = attributes.type;
			valueAttribute = attributes.value;
			nameAttribute = attributes.name;
			if ( !typeAttribute || typeAttribute.value !== 'radio' || !valueAttribute || !nameAttribute.interpolator ) {
				return;
			}
			if ( valueAttribute.value === nameAttribute.interpolator.value ) {
				return true;
			}
		}
	}( config_voidElementNames, utils_isArray );

	var render_DomFragment_Element_prototype_find = function( matches ) {

		return function( selector ) {
			var queryResult;
			if ( matches( this.node, selector ) ) {
				return this.node;
			}
			if ( this.html && ( queryResult = this.node.querySelector( selector ) ) ) {
				return queryResult;
			}
			if ( this.fragment && this.fragment.find ) {
				return this.fragment.find( selector );
			}
		};
	}( utils_matches );

	var render_DomFragment_Element_prototype_findAll = function( getMatchingStaticNodes ) {

		return function( selector, query ) {
			var matchingStaticNodes, matchedSelf;
			// Add this node to the query, if applicable, and register the
			// query on this element
			if ( query._test( this, true ) && query.live ) {
				( this.liveQueries || ( this.liveQueries = [] ) ).push( query );
			}
			if ( this.html ) {
				matchingStaticNodes = getMatchingStaticNodes( this, selector );
				query.push.apply( query, matchingStaticNodes );
				if ( query.live && !matchedSelf ) {
					( this.liveQueries || ( this.liveQueries = [] ) ).push( query );
				}
			}
			if ( this.fragment ) {
				this.fragment.findAll( selector, query );
			}
		};
	}( render_DomFragment_Element_shared_getMatchingStaticNodes );

	var render_DomFragment_Element_prototype_findComponent = function( selector ) {
		if ( this.fragment ) {
			return this.fragment.findComponent( selector );
		}
	};

	var render_DomFragment_Element_prototype_findAllComponents = function( selector, query ) {
		if ( this.fragment ) {
			this.fragment.findAllComponents( selector, query );
		}
	};

	var render_DomFragment_Element_prototype_bind = function() {
		var attributes = this.attributes;
		if ( !this.node ) {
			// we're not in a browser!
			return;
		}
		// if this is a late binding, and there's already one, it
		// needs to be torn down
		if ( this.binding ) {
			this.binding.teardown();
			this.binding = null;
		}
		// contenteditable
		if ( this.node.getAttribute( 'contenteditable' ) && attributes.value && attributes.value.bind() ) {
			return;
		}
		// an element can only have one two-way attribute
		switch ( this.descriptor.e ) {
			case 'select':
			case 'textarea':
				if ( attributes.value ) {
					attributes.value.bind();
				}
				return;
			case 'input':
				if ( this.node.type === 'radio' || this.node.type === 'checkbox' ) {
					// we can either bind the name attribute, or the checked attribute - not both
					if ( attributes.name && attributes.name.bind() ) {
						return;
					}
					if ( attributes.checked && attributes.checked.bind() ) {
						return;
					}
				}
				if ( attributes.value && attributes.value.bind() ) {
					return;
				}
		}
	};

	var render_DomFragment_Element__Element = function( runloop, css, initialise, teardown, reassign, toString, find, findAll, findComponent, findAllComponents, bind ) {

		var DomElement = function( options, docFrag ) {
			initialise( this, options, docFrag );
		};
		DomElement.prototype = {
			detach: function() {
				var Component;
				if ( this.node ) {
					// need to check for parent node - DOM may have been altered
					// by something other than Ractive! e.g. jQuery UI...
					if ( this.node.parentNode ) {
						this.node.parentNode.removeChild( this.node );
					}
					return this.node;
				}
				// If this element has child components with their own CSS, that CSS needs to
				// be removed now
				// TODO optimise this
				if ( this.cssDetachQueue.length ) {
					runloop.start();
					while ( Component === this.cssDetachQueue.pop() ) {
						css.remove( Component );
					}
					runloop.end();
				}
			},
			teardown: teardown,
			reassign: reassign,
			firstNode: function() {
				return this.node;
			},
			findNextNode: function() {
				return null;
			},
			// TODO can we get rid of this?
			bubble: function() {},
			// just so event proxy and transition fragments have something to call!
			toString: toString,
			find: find,
			findAll: findAll,
			findComponent: findComponent,
			findAllComponents: findAllComponents,
			bind: bind
		};
		return DomElement;
	}( global_runloop, global_css, render_DomFragment_Element_initialise__initialise, render_DomFragment_Element_prototype_teardown, render_DomFragment_Element_prototype_reassign, render_DomFragment_Element_prototype_toString, render_DomFragment_Element_prototype_find, render_DomFragment_Element_prototype_findAll, render_DomFragment_Element_prototype_findComponent, render_DomFragment_Element_prototype_findAllComponents, render_DomFragment_Element_prototype_bind );

	var config_errors = {
		missingParser: 'Missing Ractive.parse - cannot parse template. Either preparse or use the version that includes the parser'
	};

	var registries_partials = {};

	var parse_utils_stripHtmlComments = function( html ) {
		var commentStart, commentEnd, processed;
		processed = '';
		while ( html.length ) {
			commentStart = html.indexOf( '<!--' );
			commentEnd = html.indexOf( '-->' );
			// no comments? great
			if ( commentStart === -1 && commentEnd === -1 ) {
				processed += html;
				break;
			}
			// comment start but no comment end
			if ( commentStart !== -1 && commentEnd === -1 ) {
				throw 'Illegal HTML - expected closing comment sequence (\'-->\')';
			}
			// comment end but no comment start, or comment end before comment start
			if ( commentEnd !== -1 && commentStart === -1 || commentEnd < commentStart ) {
				throw 'Illegal HTML - unexpected closing comment sequence (\'-->\')';
			}
			processed += html.substr( 0, commentStart );
			html = html.substring( commentEnd + 3 );
		}
		return processed;
	};

	var parse_utils_stripStandalones = function( types ) {

		return function( tokens ) {
			var i, current, backOne, backTwo, leadingLinebreak, trailingLinebreak;
			leadingLinebreak = /^\s*\r?\n/;
			trailingLinebreak = /\r?\n\s*$/;
			for ( i = 2; i < tokens.length; i += 1 ) {
				current = tokens[ i ];
				backOne = tokens[ i - 1 ];
				backTwo = tokens[ i - 2 ];
				// if we're at the end of a [text][mustache][text] sequence, where [mustache] isn't a partial...
				if ( current.type === types.TEXT && ( backOne.type === types.MUSTACHE && backOne.mustacheType !== types.PARTIAL ) && backTwo.type === types.TEXT ) {
					// ... and the mustache is a standalone (i.e. line breaks either side)...
					if ( trailingLinebreak.test( backTwo.value ) && leadingLinebreak.test( current.value ) ) {
						// ... then we want to remove the whitespace after the first line break
						// if the mustache wasn't a triple or interpolator or partial
						if ( backOne.mustacheType !== types.INTERPOLATOR && backOne.mustacheType !== types.TRIPLE ) {
							backTwo.value = backTwo.value.replace( trailingLinebreak, '\n' );
						}
						// and the leading line break of the second text token
						current.value = current.value.replace( leadingLinebreak, '' );
						// if that means the current token is now empty, we should remove it
						if ( current.value === '' ) {
							tokens.splice( i--, 1 );
						}
					}
				}
			}
			return tokens;
		};
	}( config_types );

	var parse_utils_stripCommentTokens = function( types ) {

		return function( tokens ) {
			var i, current, previous, next;
			for ( i = 0; i < tokens.length; i += 1 ) {
				current = tokens[ i ];
				previous = tokens[ i - 1 ];
				next = tokens[ i + 1 ];
				// if the current token is a comment or a delimiter change, remove it...
				if ( current.mustacheType === types.COMMENT || current.mustacheType === types.DELIMCHANGE ) {
					tokens.splice( i, 1 );
					// remove comment token
					// ... and see if it has text nodes either side, in which case
					// they can be concatenated
					if ( previous && next ) {
						if ( previous.type === types.TEXT && next.type === types.TEXT ) {
							previous.value += next.value;
							tokens.splice( i, 1 );
						}
					}
					i -= 1;
				}
			}
			return tokens;
		};
	}( config_types );

	var parse_Tokenizer_getMustache_getDelimiterChange = function( makeRegexMatcher ) {

		var getDelimiter = makeRegexMatcher( /^[^\s=]+/ );
		return function( tokenizer ) {
			var start, opening, closing;
			if ( !tokenizer.getStringMatch( '=' ) ) {
				return null;
			}
			start = tokenizer.pos;
			// allow whitespace before new opening delimiter
			tokenizer.allowWhitespace();
			opening = getDelimiter( tokenizer );
			if ( !opening ) {
				tokenizer.pos = start;
				return null;
			}
			// allow whitespace (in fact, it's necessary...)
			tokenizer.allowWhitespace();
			closing = getDelimiter( tokenizer );
			if ( !closing ) {
				tokenizer.pos = start;
				return null;
			}
			// allow whitespace before closing '='
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( '=' ) ) {
				tokenizer.pos = start;
				return null;
			}
			return [
				opening,
				closing
			];
		};
	}( parse_Tokenizer_utils_makeRegexMatcher );

	var parse_Tokenizer_getMustache_getMustacheType = function( types ) {

		var mustacheTypes = {
			'#': types.SECTION,
			'^': types.INVERTED,
			'/': types.CLOSING,
			'>': types.PARTIAL,
			'!': types.COMMENT,
			'&': types.TRIPLE
		};
		return function( tokenizer ) {
			var type = mustacheTypes[ tokenizer.str.charAt( tokenizer.pos ) ];
			if ( !type ) {
				return null;
			}
			tokenizer.pos += 1;
			return type;
		};
	}( config_types );

	var parse_Tokenizer_getMustache_getMustacheContent = function( types, makeRegexMatcher, getMustacheType ) {

		var getIndexRef = makeRegexMatcher( /^\s*:\s*([a-zA-Z_$][a-zA-Z_$0-9]*)/ ),
			arrayMember = /^[0-9][1-9]*$/;
		return function( tokenizer, isTriple ) {
			var start, mustache, type, expr, i, remaining, index, delimiter, keypathExpression;
			start = tokenizer.pos;
			mustache = {
				type: isTriple ? types.TRIPLE : types.MUSTACHE
			};
			// Determine mustache type
			if ( !isTriple ) {
				// We need to test for expressions before we test for mustache type, because
				// an expression that begins '!' looks a lot like a comment
				if ( expr = tokenizer.getExpression() ) {
					mustache.mustacheType = types.INTERPOLATOR;
					// Was it actually an expression, or a comment block in disguise?
					tokenizer.allowWhitespace();
					if ( tokenizer.getStringMatch( tokenizer.delimiters[ 1 ] ) ) {
						// expression
						tokenizer.pos -= tokenizer.delimiters[ 1 ].length;
					} else {
						// comment block
						tokenizer.pos = start;
						expr = null;
					}
				}
				if ( !expr ) {
					type = getMustacheType( tokenizer );
					// Special case - ampersand mustaches
					if ( type === types.TRIPLE ) {
						mustache = {
							type: types.TRIPLE
						};
					} else {
						mustache.mustacheType = type || types.INTERPOLATOR;
					}
					// if it's a comment or a section closer, allow any contents except '}}'
					if ( type === types.COMMENT || type === types.CLOSING ) {
						remaining = tokenizer.remaining();
						index = remaining.indexOf( tokenizer.delimiters[ 1 ] );
						if ( index !== -1 ) {
							mustache.ref = remaining.substr( 0, index );
							tokenizer.pos += index;
							return mustache;
						}
					}
				}
			}
			if ( !expr ) {
				// allow whitespace
				tokenizer.allowWhitespace();
				// get expression
				expr = tokenizer.getExpression();
				// With certain valid references that aren't valid expressions,
				// e.g. {{1.foo}}, we have a problem: it looks like we've got an
				// expression, but the expression didn't consume the entire
				// reference. So we need to check that the mustache delimiters
				// appear next, unless there's an index reference (i.e. a colon)
				remaining = tokenizer.remaining();
				delimiter = isTriple ? tokenizer.tripleDelimiters[ 1 ] : tokenizer.delimiters[ 1 ];
				if ( remaining.substr( 0, delimiter.length ) !== delimiter && remaining.charAt( 0 ) !== ':' ) {
					tokenizer.pos = start;
					remaining = tokenizer.remaining();
					index = remaining.indexOf( tokenizer.delimiters[ 1 ] );
					if ( index !== -1 ) {
						mustache.ref = remaining.substr( 0, index ).trim();
						tokenizer.pos += index;
						return mustache;
					}
				}
			}
			while ( expr.t === types.BRACKETED && expr.x ) {
				expr = expr.x;
			}
			// special case - integers should be treated as array members references,
			// rather than as expressions in their own right
			if ( expr.t === types.REFERENCE ) {
				mustache.ref = expr.n;
			} else if ( expr.t === types.NUMBER_LITERAL && arrayMember.test( expr.v ) ) {
				mustache.ref = expr.v;
			} else if ( keypathExpression = getKeypathExpression( expr ) ) {
				mustache.keypathExpression = keypathExpression;
			} else {
				mustache.expression = expr;
			}
			// optional index reference
			i = getIndexRef( tokenizer );
			if ( i !== null ) {
				mustache.indexRef = i;
			}
			return mustache;
		};

		function getKeypathExpression( expr ) {
			var members = [];
			while ( expr.t === types.MEMBER && expr.r.t === types.REFINEMENT ) {
				members.unshift( expr.r );
				expr = expr.x;
			}
			if ( expr.t !== types.REFERENCE ) {
				return null;
			}
			return {
				r: expr.n,
				m: members
			};
		}
	}( config_types, parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_getMustache_getMustacheType );

	var parse_Tokenizer_getMustache__getMustache = function( types, getDelimiterChange, getMustacheContent ) {

		return function() {
			// if the triple delimiter (e.g. '{{{') is longer than the regular mustache
			// delimiter (e.g. '{{') then we need to try and find a triple first. Otherwise
			// we will get a false positive if the mustache delimiter is a substring of the
			// triple delimiter, as in the default case
			var seekTripleFirst = this.tripleDelimiters[ 0 ].length > this.delimiters[ 0 ].length;
			return getMustache( this, seekTripleFirst ) || getMustache( this, !seekTripleFirst );
		};

		function getMustache( tokenizer, seekTriple ) {
			var start = tokenizer.pos,
				content, delimiters;
			delimiters = seekTriple ? tokenizer.tripleDelimiters : tokenizer.delimiters;
			if ( !tokenizer.getStringMatch( delimiters[ 0 ] ) ) {
				return null;
			}
			// delimiter change?
			content = getDelimiterChange( tokenizer );
			if ( content ) {
				// find closing delimiter or abort...
				if ( !tokenizer.getStringMatch( delimiters[ 1 ] ) ) {
					tokenizer.pos = start;
					return null;
				}
				// ...then make the switch
				tokenizer[ seekTriple ? 'tripleDelimiters' : 'delimiters' ] = content;
				return {
					type: types.MUSTACHE,
					mustacheType: types.DELIMCHANGE
				};
			}
			tokenizer.allowWhitespace();
			content = getMustacheContent( tokenizer, seekTriple );
			if ( content === null ) {
				tokenizer.pos = start;
				return null;
			}
			// allow whitespace before closing delimiter
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( delimiters[ 1 ] ) ) {
				tokenizer.pos = start;
				return null;
			}
			return content;
		}
	}( config_types, parse_Tokenizer_getMustache_getDelimiterChange, parse_Tokenizer_getMustache_getMustacheContent );

	var parse_Tokenizer_getComment_getComment = function( types ) {

		return function() {
			var content, remaining, endIndex;
			if ( !this.getStringMatch( '<!--' ) ) {
				return null;
			}
			remaining = this.remaining();
			endIndex = remaining.indexOf( '-->' );
			if ( endIndex === -1 ) {
				throw new Error( 'Unexpected end of input (expected "-->" to close comment)' );
			}
			content = remaining.substr( 0, endIndex );
			this.pos += endIndex + 3;
			return {
				type: types.COMMENT,
				content: content
			};
		};
	}( config_types );

	var parse_Tokenizer_utils_getLowestIndex = function( haystack, needles ) {
		var i, index, lowest;
		i = needles.length;
		while ( i-- ) {
			index = haystack.indexOf( needles[ i ] );
			// short circuit
			if ( !index ) {
				return 0;
			}
			if ( index === -1 ) {
				continue;
			}
			if ( !lowest || index < lowest ) {
				lowest = index;
			}
		}
		return lowest || -1;
	};

	var parse_Tokenizer_getTag__getTag = function( types, makeRegexMatcher, getLowestIndex ) {

		var getTag, getOpeningTag, getClosingTag, getTagName, getAttributes, getAttribute, getAttributeName, getAttributeValue, getUnquotedAttributeValue, getUnquotedAttributeValueToken, getUnquotedAttributeValueText, getQuotedStringToken, getQuotedAttributeValue;
		getTag = function() {
			return getOpeningTag( this ) || getClosingTag( this );
		};
		getOpeningTag = function( tokenizer ) {
			var start, tag, attrs, lowerCaseName;
			start = tokenizer.pos;
			if ( tokenizer.inside ) {
				return null;
			}
			if ( !tokenizer.getStringMatch( '<' ) ) {
				return null;
			}
			tag = {
				type: types.TAG
			};
			if ( tokenizer.getStringMatch( '!' ) ) {
				tag.doctype = true;
			}
			// tag name
			tag.name = getTagName( tokenizer );
			if ( !tag.name ) {
				tokenizer.pos = start;
				return null;
			}
			// attributes
			attrs = getAttributes( tokenizer );
			if ( attrs ) {
				tag.attrs = attrs;
			}
			// allow whitespace before closing solidus
			tokenizer.allowWhitespace();
			// self-closing solidus?
			if ( tokenizer.getStringMatch( '/' ) ) {
				tag.selfClosing = true;
			}
			// closing angle bracket
			if ( !tokenizer.getStringMatch( '>' ) ) {
				tokenizer.pos = start;
				return null;
			}
			// Special case - if we open a script tag, further tags should
			// be ignored unless they're a closing script tag
			lowerCaseName = tag.name.toLowerCase();
			if ( lowerCaseName === 'script' || lowerCaseName === 'style' ) {
				tokenizer.inside = lowerCaseName;
			}
			return tag;
		};
		getClosingTag = function( tokenizer ) {
			var start, tag, expected;
			start = tokenizer.pos;
			expected = function( str ) {
				throw new Error( 'Unexpected character ' + tokenizer.remaining().charAt( 0 ) + ' (expected ' + str + ')' );
			};
			if ( !tokenizer.getStringMatch( '<' ) ) {
				return null;
			}
			tag = {
				type: types.TAG,
				closing: true
			};
			// closing solidus
			if ( !tokenizer.getStringMatch( '/' ) ) {
				expected( '"/"' );
			}
			// tag name
			tag.name = getTagName( tokenizer );
			if ( !tag.name ) {
				expected( 'tag name' );
			}
			// closing angle bracket
			if ( !tokenizer.getStringMatch( '>' ) ) {
				expected( '">"' );
			}
			if ( tokenizer.inside ) {
				if ( tag.name.toLowerCase() !== tokenizer.inside ) {
					tokenizer.pos = start;
					return null;
				}
				tokenizer.inside = null;
			}
			return tag;
		};
		getTagName = makeRegexMatcher( /^[a-zA-Z]{1,}:?[a-zA-Z0-9\-]*/ );
		getAttributes = function( tokenizer ) {
			var start, attrs, attr;
			start = tokenizer.pos;
			// if the next character isn't whitespace, there are no attributes...
			if ( !tokenizer.getStringMatch( ' ' ) && !tokenizer.getStringMatch( '\n' ) ) {
				return null;
			}
			// ...but allow arbitrary amounts of whitespace
			tokenizer.allowWhitespace();
			attr = getAttribute( tokenizer );
			if ( !attr ) {
				tokenizer.pos = start;
				return null;
			}
			attrs = [];
			while ( attr !== null ) {
				attrs.push( attr );
				tokenizer.allowWhitespace();
				attr = getAttribute( tokenizer );
			}
			return attrs;
		};
		getAttribute = function( tokenizer ) {
			var attr, name, value;
			name = getAttributeName( tokenizer );
			if ( !name ) {
				return null;
			}
			attr = {
				name: name
			};
			value = getAttributeValue( tokenizer );
			if ( value ) {
				attr.value = value;
			}
			return attr;
		};
		getAttributeName = makeRegexMatcher( /^[^\s"'>\/=]+/ );
		getAttributeValue = function( tokenizer ) {
			var start, value;
			start = tokenizer.pos;
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( '=' ) ) {
				tokenizer.pos = start;
				return null;
			}
			tokenizer.allowWhitespace();
			value = getQuotedAttributeValue( tokenizer, '\'' ) || getQuotedAttributeValue( tokenizer, '"' ) || getUnquotedAttributeValue( tokenizer );
			if ( value === null ) {
				tokenizer.pos = start;
				return null;
			}
			return value;
		};
		getUnquotedAttributeValueText = makeRegexMatcher( /^[^\s"'=<>`]+/ );
		getUnquotedAttributeValueToken = function( tokenizer ) {
			var start, text, index;
			start = tokenizer.pos;
			text = getUnquotedAttributeValueText( tokenizer );
			if ( !text ) {
				return null;
			}
			if ( ( index = text.indexOf( tokenizer.delimiters[ 0 ] ) ) !== -1 ) {
				text = text.substr( 0, index );
				tokenizer.pos = start + text.length;
			}
			return {
				type: types.TEXT,
				value: text
			};
		};
		getUnquotedAttributeValue = function( tokenizer ) {
			var tokens, token;
			tokens = [];
			token = tokenizer.getMustache() || getUnquotedAttributeValueToken( tokenizer );
			while ( token !== null ) {
				tokens.push( token );
				token = tokenizer.getMustache() || getUnquotedAttributeValueToken( tokenizer );
			}
			if ( !tokens.length ) {
				return null;
			}
			return tokens;
		};
		getQuotedAttributeValue = function( tokenizer, quoteMark ) {
			var start, tokens, token;
			start = tokenizer.pos;
			if ( !tokenizer.getStringMatch( quoteMark ) ) {
				return null;
			}
			tokens = [];
			token = tokenizer.getMustache() || getQuotedStringToken( tokenizer, quoteMark );
			while ( token !== null ) {
				tokens.push( token );
				token = tokenizer.getMustache() || getQuotedStringToken( tokenizer, quoteMark );
			}
			if ( !tokenizer.getStringMatch( quoteMark ) ) {
				tokenizer.pos = start;
				return null;
			}
			return tokens;
		};
		getQuotedStringToken = function( tokenizer, quoteMark ) {
			var start, index, remaining;
			start = tokenizer.pos;
			remaining = tokenizer.remaining();
			index = getLowestIndex( remaining, [
				quoteMark,
				tokenizer.delimiters[ 0 ],
				tokenizer.delimiters[ 1 ]
			] );
			if ( index === -1 ) {
				throw new Error( 'Quoted attribute value must have a closing quote' );
			}
			if ( !index ) {
				return null;
			}
			tokenizer.pos += index;
			return {
				type: types.TEXT,
				value: remaining.substr( 0, index )
			};
		};
		return getTag;
	}( config_types, parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_utils_getLowestIndex );

	var parse_Tokenizer_getText__getText = function( types, getLowestIndex ) {

		return function() {
			var index, remaining, barrier;
			remaining = this.remaining();
			barrier = this.inside ? '</' + this.inside : '<';
			if ( this.inside && !this.interpolate[ this.inside ] ) {
				index = remaining.indexOf( barrier );
			} else {
				index = getLowestIndex( remaining, [
					barrier,
					this.delimiters[ 0 ],
					this.tripleDelimiters[ 0 ]
				] );
			}
			if ( !index ) {
				return null;
			}
			if ( index === -1 ) {
				index = remaining.length;
			}
			this.pos += index;
			return {
				type: types.TEXT,
				value: remaining.substr( 0, index )
			};
		};
	}( config_types, parse_Tokenizer_utils_getLowestIndex );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getBooleanLiteral = function( types ) {

		return function( tokenizer ) {
			var remaining = tokenizer.remaining();
			if ( remaining.substr( 0, 4 ) === 'true' ) {
				tokenizer.pos += 4;
				return {
					t: types.BOOLEAN_LITERAL,
					v: 'true'
				};
			}
			if ( remaining.substr( 0, 5 ) === 'false' ) {
				tokenizer.pos += 5;
				return {
					t: types.BOOLEAN_LITERAL,
					v: 'false'
				};
			}
			return null;
		};
	}( config_types );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePair = function( types, getKey ) {

		return function( tokenizer ) {
			var start, key, value;
			start = tokenizer.pos;
			// allow whitespace between '{' and key
			tokenizer.allowWhitespace();
			key = getKey( tokenizer );
			if ( key === null ) {
				tokenizer.pos = start;
				return null;
			}
			// allow whitespace between key and ':'
			tokenizer.allowWhitespace();
			// next character must be ':'
			if ( !tokenizer.getStringMatch( ':' ) ) {
				tokenizer.pos = start;
				return null;
			}
			// allow whitespace between ':' and value
			tokenizer.allowWhitespace();
			// next expression must be a, well... expression
			value = tokenizer.getExpression();
			if ( value === null ) {
				tokenizer.pos = start;
				return null;
			}
			return {
				t: types.KEY_VALUE_PAIR,
				k: key,
				v: value
			};
		};
	}( config_types, parse_Tokenizer_getExpression_shared_getKey );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePairs = function( getKeyValuePair ) {

		return function getKeyValuePairs( tokenizer ) {
			var start, pairs, pair, keyValuePairs;
			start = tokenizer.pos;
			pair = getKeyValuePair( tokenizer );
			if ( pair === null ) {
				return null;
			}
			pairs = [ pair ];
			if ( tokenizer.getStringMatch( ',' ) ) {
				keyValuePairs = getKeyValuePairs( tokenizer );
				if ( !keyValuePairs ) {
					tokenizer.pos = start;
					return null;
				}
				return pairs.concat( keyValuePairs );
			}
			return pairs;
		};
	}( parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePair );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral__getObjectLiteral = function( types, getKeyValuePairs ) {

		return function( tokenizer ) {
			var start, keyValuePairs;
			start = tokenizer.pos;
			// allow whitespace
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( '{' ) ) {
				tokenizer.pos = start;
				return null;
			}
			keyValuePairs = getKeyValuePairs( tokenizer );
			// allow whitespace between final value and '}'
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( '}' ) ) {
				tokenizer.pos = start;
				return null;
			}
			return {
				t: types.OBJECT_LITERAL,
				m: keyValuePairs
			};
		};
	}( config_types, parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral_getKeyValuePairs );

	var parse_Tokenizer_getExpression_shared_getExpressionList = function getExpressionList( tokenizer ) {
		var start, expressions, expr, next;
		start = tokenizer.pos;
		tokenizer.allowWhitespace();
		expr = tokenizer.getExpression();
		if ( expr === null ) {
			return null;
		}
		expressions = [ expr ];
		// allow whitespace between expression and ','
		tokenizer.allowWhitespace();
		if ( tokenizer.getStringMatch( ',' ) ) {
			next = getExpressionList( tokenizer );
			if ( next === null ) {
				tokenizer.pos = start;
				return null;
			}
			expressions = expressions.concat( next );
		}
		return expressions;
	};

	var parse_Tokenizer_getExpression_getPrimary_getLiteral_getArrayLiteral = function( types, getExpressionList ) {

		return function( tokenizer ) {
			var start, expressionList;
			start = tokenizer.pos;
			// allow whitespace before '['
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( '[' ) ) {
				tokenizer.pos = start;
				return null;
			}
			expressionList = getExpressionList( tokenizer );
			if ( !tokenizer.getStringMatch( ']' ) ) {
				tokenizer.pos = start;
				return null;
			}
			return {
				t: types.ARRAY_LITERAL,
				m: expressionList
			};
		};
	}( config_types, parse_Tokenizer_getExpression_shared_getExpressionList );

	var parse_Tokenizer_getExpression_getPrimary_getLiteral__getLiteral = function( getNumberLiteral, getBooleanLiteral, getStringLiteral, getObjectLiteral, getArrayLiteral ) {

		return function( tokenizer ) {
			var literal = getNumberLiteral( tokenizer ) || getBooleanLiteral( tokenizer ) || getStringLiteral( tokenizer ) || getObjectLiteral( tokenizer ) || getArrayLiteral( tokenizer );
			return literal;
		};
	}( parse_Tokenizer_getExpression_getPrimary_getLiteral_getNumberLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getBooleanLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getStringLiteral__getStringLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getObjectLiteral__getObjectLiteral, parse_Tokenizer_getExpression_getPrimary_getLiteral_getArrayLiteral );

	var parse_Tokenizer_getExpression_getPrimary_getReference = function( types, makeRegexMatcher, getName ) {

		var getDotRefinement, getArrayRefinement, getArrayMember, globals;
		getDotRefinement = makeRegexMatcher( /^\.[a-zA-Z_$0-9]+/ );
		getArrayRefinement = function( tokenizer ) {
			var num = getArrayMember( tokenizer );
			if ( num ) {
				return '.' + num;
			}
			return null;
		};
		getArrayMember = makeRegexMatcher( /^\[(0|[1-9][0-9]*)\]/ );
		// if a reference is a browser global, we don't deference it later, so it needs special treatment
		globals = /^(?:Array|Date|RegExp|decodeURIComponent|decodeURI|encodeURIComponent|encodeURI|isFinite|isNaN|parseFloat|parseInt|JSON|Math|NaN|undefined|null)$/;
		return function( tokenizer ) {
			var startPos, ancestor, name, dot, combo, refinement, lastDotIndex;
			startPos = tokenizer.pos;
			// we might have ancestor refs...
			ancestor = '';
			while ( tokenizer.getStringMatch( '../' ) ) {
				ancestor += '../';
			}
			if ( !ancestor ) {
				// we might have an implicit iterator or a restricted reference
				dot = tokenizer.getStringMatch( '.' ) || '';
			}
			name = getName( tokenizer ) || '';
			// if this is a browser global, stop here
			if ( !ancestor && !dot && globals.test( name ) ) {
				return {
					t: types.GLOBAL,
					v: name
				};
			}
			// allow the use of `this`
			if ( name === 'this' && !ancestor && !dot ) {
				name = '.';
				startPos += 3;
			}
			combo = ( ancestor || dot ) + name;
			if ( !combo ) {
				return null;
			}
			while ( refinement = getDotRefinement( tokenizer ) || getArrayRefinement( tokenizer ) ) {
				combo += refinement;
			}
			if ( tokenizer.getStringMatch( '(' ) ) {
				// if this is a method invocation (as opposed to a function) we need
				// to strip the method name from the reference combo, else the context
				// will be wrong
				lastDotIndex = combo.lastIndexOf( '.' );
				if ( lastDotIndex !== -1 ) {
					combo = combo.substr( 0, lastDotIndex );
					tokenizer.pos = startPos + combo.length;
				} else {
					tokenizer.pos -= 1;
				}
			}
			return {
				t: types.REFERENCE,
				n: combo
			};
		};
	}( config_types, parse_Tokenizer_utils_makeRegexMatcher, parse_Tokenizer_getExpression_shared_getName );

	var parse_Tokenizer_getExpression_getPrimary_getBracketedExpression = function( types ) {

		return function( tokenizer ) {
			var start, expr;
			start = tokenizer.pos;
			if ( !tokenizer.getStringMatch( '(' ) ) {
				return null;
			}
			tokenizer.allowWhitespace();
			expr = tokenizer.getExpression();
			if ( !expr ) {
				tokenizer.pos = start;
				return null;
			}
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( ')' ) ) {
				tokenizer.pos = start;
				return null;
			}
			return {
				t: types.BRACKETED,
				x: expr
			};
		};
	}( config_types );

	var parse_Tokenizer_getExpression_getPrimary__getPrimary = function( getLiteral, getReference, getBracketedExpression ) {

		return function( tokenizer ) {
			return getLiteral( tokenizer ) || getReference( tokenizer ) || getBracketedExpression( tokenizer );
		};
	}( parse_Tokenizer_getExpression_getPrimary_getLiteral__getLiteral, parse_Tokenizer_getExpression_getPrimary_getReference, parse_Tokenizer_getExpression_getPrimary_getBracketedExpression );

	var parse_Tokenizer_getExpression_shared_getRefinement = function( types, getName ) {

		return function getRefinement( tokenizer ) {
			var start, name, expr;
			start = tokenizer.pos;
			tokenizer.allowWhitespace();
			// "." name
			if ( tokenizer.getStringMatch( '.' ) ) {
				tokenizer.allowWhitespace();
				if ( name = getName( tokenizer ) ) {
					return {
						t: types.REFINEMENT,
						n: name
					};
				}
				tokenizer.expected( 'a property name' );
			}
			// "[" expression "]"
			if ( tokenizer.getStringMatch( '[' ) ) {
				tokenizer.allowWhitespace();
				expr = tokenizer.getExpression();
				if ( !expr ) {
					tokenizer.expected( 'an expression' );
				}
				tokenizer.allowWhitespace();
				if ( !tokenizer.getStringMatch( ']' ) ) {
					tokenizer.expected( '"]"' );
				}
				return {
					t: types.REFINEMENT,
					x: expr
				};
			}
			return null;
		};
	}( config_types, parse_Tokenizer_getExpression_shared_getName );

	var parse_Tokenizer_getExpression_getMemberOrInvocation = function( types, getPrimary, getExpressionList, getRefinement ) {

		return function( tokenizer ) {
			var current, expression, refinement, expressionList;
			expression = getPrimary( tokenizer );
			if ( !expression ) {
				return null;
			}
			while ( expression ) {
				current = tokenizer.pos;
				if ( refinement = getRefinement( tokenizer ) ) {
					expression = {
						t: types.MEMBER,
						x: expression,
						r: refinement
					};
				} else if ( tokenizer.getStringMatch( '(' ) ) {
					tokenizer.allowWhitespace();
					expressionList = getExpressionList( tokenizer );
					tokenizer.allowWhitespace();
					if ( !tokenizer.getStringMatch( ')' ) ) {
						tokenizer.pos = current;
						break;
					}
					expression = {
						t: types.INVOCATION,
						x: expression
					};
					if ( expressionList ) {
						expression.o = expressionList;
					}
				} else {
					break;
				}
			}
			return expression;
		};
	}( config_types, parse_Tokenizer_getExpression_getPrimary__getPrimary, parse_Tokenizer_getExpression_shared_getExpressionList, parse_Tokenizer_getExpression_shared_getRefinement );

	var parse_Tokenizer_getExpression_getTypeOf = function( types, getMemberOrInvocation ) {

		var getTypeOf, makePrefixSequenceMatcher;
		makePrefixSequenceMatcher = function( symbol, fallthrough ) {
			return function( tokenizer ) {
				var start, expression;
				if ( !tokenizer.getStringMatch( symbol ) ) {
					return fallthrough( tokenizer );
				}
				start = tokenizer.pos;
				tokenizer.allowWhitespace();
				expression = tokenizer.getExpression();
				if ( !expression ) {
					tokenizer.expected( 'an expression' );
				}
				return {
					s: symbol,
					o: expression,
					t: types.PREFIX_OPERATOR
				};
			};
		};
		// create all prefix sequence matchers, return getTypeOf
		( function() {
			var i, len, matcher, prefixOperators, fallthrough;
			prefixOperators = '! ~ + - typeof'.split( ' ' );
			fallthrough = getMemberOrInvocation;
			for ( i = 0, len = prefixOperators.length; i < len; i += 1 ) {
				matcher = makePrefixSequenceMatcher( prefixOperators[ i ], fallthrough );
				fallthrough = matcher;
			}
			// typeof operator is higher precedence than multiplication, so provides the
			// fallthrough for the multiplication sequence matcher we're about to create
			// (we're skipping void and delete)
			getTypeOf = fallthrough;
		}() );
		return getTypeOf;
	}( config_types, parse_Tokenizer_getExpression_getMemberOrInvocation );

	var parse_Tokenizer_getExpression_getLogicalOr = function( types, getTypeOf ) {

		var getLogicalOr, makeInfixSequenceMatcher;
		makeInfixSequenceMatcher = function( symbol, fallthrough ) {
			return function( tokenizer ) {
				var start, left, right;
				left = fallthrough( tokenizer );
				if ( !left ) {
					return null;
				}
				// Loop to handle left-recursion in a case like `a * b * c` and produce
				// left association, i.e. `(a * b) * c`.  The matcher can't call itself
				// to parse `left` because that would be infinite regress.
				while ( true ) {
					start = tokenizer.pos;
					tokenizer.allowWhitespace();
					if ( !tokenizer.getStringMatch( symbol ) ) {
						tokenizer.pos = start;
						return left;
					}
					// special case - in operator must not be followed by [a-zA-Z_$0-9]
					if ( symbol === 'in' && /[a-zA-Z_$0-9]/.test( tokenizer.remaining().charAt( 0 ) ) ) {
						tokenizer.pos = start;
						return left;
					}
					tokenizer.allowWhitespace();
					// right operand must also consist of only higher-precedence operators
					right = fallthrough( tokenizer );
					if ( !right ) {
						tokenizer.pos = start;
						return left;
					}
					left = {
						t: types.INFIX_OPERATOR,
						s: symbol,
						o: [
							left,
							right
						]
					};
				}
			};
		};
		// create all infix sequence matchers, and return getLogicalOr
		( function() {
			var i, len, matcher, infixOperators, fallthrough;
			// All the infix operators on order of precedence (source: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Operators/Operator_Precedence)
			// Each sequence matcher will initially fall through to its higher precedence
			// neighbour, and only attempt to match if one of the higher precedence operators
			// (or, ultimately, a literal, reference, or bracketed expression) already matched
			infixOperators = '* / % + - << >> >>> < <= > >= in instanceof == != === !== & ^ | && ||'.split( ' ' );
			// A typeof operator is higher precedence than multiplication
			fallthrough = getTypeOf;
			for ( i = 0, len = infixOperators.length; i < len; i += 1 ) {
				matcher = makeInfixSequenceMatcher( infixOperators[ i ], fallthrough );
				fallthrough = matcher;
			}
			// Logical OR is the fallthrough for the conditional matcher
			getLogicalOr = fallthrough;
		}() );
		return getLogicalOr;
	}( config_types, parse_Tokenizer_getExpression_getTypeOf );

	var parse_Tokenizer_getExpression_getConditional = function( types, getLogicalOr ) {

		// The conditional operator is the lowest precedence operator, so we start here
		return function( tokenizer ) {
			var start, expression, ifTrue, ifFalse;
			expression = getLogicalOr( tokenizer );
			if ( !expression ) {
				return null;
			}
			start = tokenizer.pos;
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( '?' ) ) {
				tokenizer.pos = start;
				return expression;
			}
			tokenizer.allowWhitespace();
			ifTrue = tokenizer.getExpression();
			if ( !ifTrue ) {
				tokenizer.pos = start;
				return expression;
			}
			tokenizer.allowWhitespace();
			if ( !tokenizer.getStringMatch( ':' ) ) {
				tokenizer.pos = start;
				return expression;
			}
			tokenizer.allowWhitespace();
			ifFalse = tokenizer.getExpression();
			if ( !ifFalse ) {
				tokenizer.pos = start;
				return expression;
			}
			return {
				t: types.CONDITIONAL,
				o: [
					expression,
					ifTrue,
					ifFalse
				]
			};
		};
	}( config_types, parse_Tokenizer_getExpression_getLogicalOr );

	var parse_Tokenizer_getExpression__getExpression = function( getConditional ) {

		// The conditional operator is the lowest precedence operator (except yield,
		// assignment operators, and commas, none of which are supported), so we
		// start there. If it doesn't match, it 'falls through' to progressively
		// higher precedence operators, until it eventually matches (or fails to
		// match) a 'primary' - a literal or a reference. This way, the abstract syntax
		// tree has everything in its proper place, i.e. 2 + 3 * 4 === 14, not 20.
		return function() {
			return getConditional( this );
		};
	}( parse_Tokenizer_getExpression_getConditional );

	var parse_Tokenizer__Tokenizer = function( getMustache, getComment, getTag, getText, getExpression, allowWhitespace, getStringMatch ) {

		var Tokenizer;
		Tokenizer = function( str, options ) {
			var token;
			this.str = str;
			this.pos = 0;
			this.delimiters = options.delimiters;
			this.tripleDelimiters = options.tripleDelimiters;
			this.interpolate = options.interpolate;
			this.tokens = [];
			while ( this.pos < this.str.length ) {
				token = this.getToken();
				if ( token === null && this.remaining() ) {
					this.fail();
				}
				this.tokens.push( token );
			}
		};
		Tokenizer.prototype = {
			getToken: function() {
				var token = this.getMustache() || this.getComment() || this.getTag() || this.getText();
				return token;
			},
			getMustache: getMustache,
			getComment: getComment,
			getTag: getTag,
			getText: getText,
			getExpression: getExpression,
			// utils
			allowWhitespace: allowWhitespace,
			getStringMatch: getStringMatch,
			remaining: function() {
				return this.str.substring( this.pos );
			},
			fail: function() {
				var last20, next20;
				last20 = this.str.substr( 0, this.pos ).substr( -20 );
				if ( last20.length === 20 ) {
					last20 = '...' + last20;
				}
				next20 = this.remaining().substr( 0, 20 );
				if ( next20.length === 20 ) {
					next20 = next20 + '...';
				}
				throw new Error( 'Could not parse template: ' + ( last20 ? last20 + '<- ' : '' ) + 'failed at character ' + this.pos + ' ->' + next20 );
			},
			expected: function( thing ) {
				var remaining = this.remaining().substr( 0, 40 );
				if ( remaining.length === 40 ) {
					remaining += '...';
				}
				throw new Error( 'Tokenizer failed: unexpected string "' + remaining + '" (expected ' + thing + ')' );
			}
		};
		return Tokenizer;
	}( parse_Tokenizer_getMustache__getMustache, parse_Tokenizer_getComment_getComment, parse_Tokenizer_getTag__getTag, parse_Tokenizer_getText__getText, parse_Tokenizer_getExpression__getExpression, parse_Tokenizer_utils_allowWhitespace, parse_Tokenizer_utils_getStringMatch );

	var parse_tokenize = function( initOptions, stripHtmlComments, stripStandalones, stripCommentTokens, Tokenizer ) {

		return function( template, options ) {
			var tokenizer, tokens;
			options = options || {};
			if ( options.stripComments !== false ) {
				template = stripHtmlComments( template );
			}
			// TODO handle delimiters differently
			tokenizer = new Tokenizer( template, {
				delimiters: options.delimiters || initOptions.defaults.delimiters,
				tripleDelimiters: options.tripleDelimiters || initOptions.defaults.tripleDelimiters,
				interpolate: {
					script: options.interpolateScripts !== false ? true : false,
					style: options.interpolateStyles !== false ? true : false
				}
			} );
			// TODO and this...
			tokens = tokenizer.tokens;
			stripStandalones( tokens );
			stripCommentTokens( tokens );
			return tokens;
		};
	}( config_initOptions, parse_utils_stripHtmlComments, parse_utils_stripStandalones, parse_utils_stripCommentTokens, parse_Tokenizer__Tokenizer );

	var parse_Parser_getText_TextStub__TextStub = function( types ) {

		var TextStub,
			// helpers
			htmlEntities, controlCharacters, namedEntityPattern, hexEntityPattern, decimalEntityPattern, validateCode, decodeCharacterReferences, whitespace;
		TextStub = function( token, preserveWhitespace ) {
			this.text = preserveWhitespace ? token.value : token.value.replace( whitespace, ' ' );
		};
		TextStub.prototype = {
			type: types.TEXT,
			toJSON: function() {
				// this will be used within HTML, so we need to decode things like &amp;
				return this.decoded || ( this.decoded = decodeCharacterReferences( this.text ) );
			},
			toString: function() {
				// this will be used as straight text
				return this.text;
			}
		};
		htmlEntities = {
			quot: 34,
			amp: 38,
			apos: 39,
			lt: 60,
			gt: 62,
			nbsp: 160,
			iexcl: 161,
			cent: 162,
			pound: 163,
			curren: 164,
			yen: 165,
			brvbar: 166,
			sect: 167,
			uml: 168,
			copy: 169,
			ordf: 170,
			laquo: 171,
			not: 172,
			shy: 173,
			reg: 174,
			macr: 175,
			deg: 176,
			plusmn: 177,
			sup2: 178,
			sup3: 179,
			acute: 180,
			micro: 181,
			para: 182,
			middot: 183,
			cedil: 184,
			sup1: 185,
			ordm: 186,
			raquo: 187,
			frac14: 188,
			frac12: 189,
			frac34: 190,
			iquest: 191,
			Agrave: 192,
			Aacute: 193,
			Acirc: 194,
			Atilde: 195,
			Auml: 196,
			Aring: 197,
			AElig: 198,
			Ccedil: 199,
			Egrave: 200,
			Eacute: 201,
			Ecirc: 202,
			Euml: 203,
			Igrave: 204,
			Iacute: 205,
			Icirc: 206,
			Iuml: 207,
			ETH: 208,
			Ntilde: 209,
			Ograve: 210,
			Oacute: 211,
			Ocirc: 212,
			Otilde: 213,
			Ouml: 214,
			times: 215,
			Oslash: 216,
			Ugrave: 217,
			Uacute: 218,
			Ucirc: 219,
			Uuml: 220,
			Yacute: 221,
			THORN: 222,
			szlig: 223,
			agrave: 224,
			aacute: 225,
			acirc: 226,
			atilde: 227,
			auml: 228,
			aring: 229,
			aelig: 230,
			ccedil: 231,
			egrave: 232,
			eacute: 233,
			ecirc: 234,
			euml: 235,
			igrave: 236,
			iacute: 237,
			icirc: 238,
			iuml: 239,
			eth: 240,
			ntilde: 241,
			ograve: 242,
			oacute: 243,
			ocirc: 244,
			otilde: 245,
			ouml: 246,
			divide: 247,
			oslash: 248,
			ugrave: 249,
			uacute: 250,
			ucirc: 251,
			uuml: 252,
			yacute: 253,
			thorn: 254,
			yuml: 255,
			OElig: 338,
			oelig: 339,
			Scaron: 352,
			scaron: 353,
			Yuml: 376,
			fnof: 402,
			circ: 710,
			tilde: 732,
			Alpha: 913,
			Beta: 914,
			Gamma: 915,
			Delta: 916,
			Epsilon: 917,
			Zeta: 918,
			Eta: 919,
			Theta: 920,
			Iota: 921,
			Kappa: 922,
			Lambda: 923,
			Mu: 924,
			Nu: 925,
			Xi: 926,
			Omicron: 927,
			Pi: 928,
			Rho: 929,
			Sigma: 931,
			Tau: 932,
			Upsilon: 933,
			Phi: 934,
			Chi: 935,
			Psi: 936,
			Omega: 937,
			alpha: 945,
			beta: 946,
			gamma: 947,
			delta: 948,
			epsilon: 949,
			zeta: 950,
			eta: 951,
			theta: 952,
			iota: 953,
			kappa: 954,
			lambda: 955,
			mu: 956,
			nu: 957,
			xi: 958,
			omicron: 959,
			pi: 960,
			rho: 961,
			sigmaf: 962,
			sigma: 963,
			tau: 964,
			upsilon: 965,
			phi: 966,
			chi: 967,
			psi: 968,
			omega: 969,
			thetasym: 977,
			upsih: 978,
			piv: 982,
			ensp: 8194,
			emsp: 8195,
			thinsp: 8201,
			zwnj: 8204,
			zwj: 8205,
			lrm: 8206,
			rlm: 8207,
			ndash: 8211,
			mdash: 8212,
			lsquo: 8216,
			rsquo: 8217,
			sbquo: 8218,
			ldquo: 8220,
			rdquo: 8221,
			bdquo: 8222,
			dagger: 8224,
			Dagger: 8225,
			bull: 8226,
			hellip: 8230,
			permil: 8240,
			prime: 8242,
			Prime: 8243,
			lsaquo: 8249,
			rsaquo: 8250,
			oline: 8254,
			frasl: 8260,
			euro: 8364,
			image: 8465,
			weierp: 8472,
			real: 8476,
			trade: 8482,
			alefsym: 8501,
			larr: 8592,
			uarr: 8593,
			rarr: 8594,
			darr: 8595,
			harr: 8596,
			crarr: 8629,
			lArr: 8656,
			uArr: 8657,
			rArr: 8658,
			dArr: 8659,
			hArr: 8660,
			forall: 8704,
			part: 8706,
			exist: 8707,
			empty: 8709,
			nabla: 8711,
			isin: 8712,
			notin: 8713,
			ni: 8715,
			prod: 8719,
			sum: 8721,
			minus: 8722,
			lowast: 8727,
			radic: 8730,
			prop: 8733,
			infin: 8734,
			ang: 8736,
			and: 8743,
			or: 8744,
			cap: 8745,
			cup: 8746,
			'int': 8747,
			there4: 8756,
			sim: 8764,
			cong: 8773,
			asymp: 8776,
			ne: 8800,
			equiv: 8801,
			le: 8804,
			ge: 8805,
			sub: 8834,
			sup: 8835,
			nsub: 8836,
			sube: 8838,
			supe: 8839,
			oplus: 8853,
			otimes: 8855,
			perp: 8869,
			sdot: 8901,
			lceil: 8968,
			rceil: 8969,
			lfloor: 8970,
			rfloor: 8971,
			lang: 9001,
			rang: 9002,
			loz: 9674,
			spades: 9824,
			clubs: 9827,
			hearts: 9829,
			diams: 9830
		};
		controlCharacters = [
			8364,
			129,
			8218,
			402,
			8222,
			8230,
			8224,
			8225,
			710,
			8240,
			352,
			8249,
			338,
			141,
			381,
			143,
			144,
			8216,
			8217,
			8220,
			8221,
			8226,
			8211,
			8212,
			732,
			8482,
			353,
			8250,
			339,
			157,
			382,
			376
		];
		namedEntityPattern = new RegExp( '&(' + Object.keys( htmlEntities ).join( '|' ) + ');?', 'g' );
		hexEntityPattern = /&#x([0-9]+);?/g;
		decimalEntityPattern = /&#([0-9]+);?/g;
		// some code points are verboten. If we were inserting HTML, the browser would replace the illegal
		// code points with alternatives in some cases - since we're bypassing that mechanism, we need
		// to replace them ourselves
		//
		// Source: http://en.wikipedia.org/wiki/Character_encodings_in_HTML#Illegal_characters
		validateCode = function( code ) {
			if ( !code ) {
				return 65533;
			}
			// line feed becomes generic whitespace
			if ( code === 10 ) {
				return 32;
			}
			// ASCII range. (Why someone would use HTML entities for ASCII characters I don't know, but...)
			if ( code < 128 ) {
				return code;
			}
			// code points 128-159 are dealt with leniently by browsers, but they're incorrect. We need
			// to correct the mistake or we'll end up with missing € signs and so on
			if ( code <= 159 ) {
				return controlCharacters[ code - 128 ];
			}
			// basic multilingual plane
			if ( code < 55296 ) {
				return code;
			}
			// UTF-16 surrogate halves
			if ( code <= 57343 ) {
				return 65533;
			}
			// rest of the basic multilingual plane
			if ( code <= 65535 ) {
				return code;
			}
			// TODO it's... not exactly clear what should happen with code points over this value. The
			// following seems to work. But I can't guarantee it works in China!
			return 65533;
		};
		decodeCharacterReferences = function( html ) {
			var result;
			// named entities
			result = html.replace( namedEntityPattern, function( match, name ) {
				if ( htmlEntities[ name ] ) {
					return String.fromCharCode( htmlEntities[ name ] );
				}
				return match;
			} );
			// hex references
			result = result.replace( hexEntityPattern, function( match, hex ) {
				return String.fromCharCode( validateCode( parseInt( hex, 16 ) ) );
			} );
			// decimal references
			result = result.replace( decimalEntityPattern, function( match, charCode ) {
				return String.fromCharCode( validateCode( charCode ) );
			} );
			return result;
		};
		whitespace = /\s+/g;
		return TextStub;
	}( config_types );

	var parse_Parser_getText__getText = function( types, TextStub ) {

		return function( token, preserveWhitespace ) {
			if ( token.type === types.TEXT ) {
				this.pos += 1;
				return new TextStub( token, preserveWhitespace );
			}
			return null;
		};
	}( config_types, parse_Parser_getText_TextStub__TextStub );

	var parse_Parser_getComment_CommentStub__CommentStub = function( types ) {

		var CommentStub;
		CommentStub = function( token ) {
			this.content = token.content;
		};
		CommentStub.prototype = {
			toJSON: function() {
				return {
					t: types.COMMENT,
					f: this.content
				};
			},
			toString: function() {
				return '<!--' + this.content + '-->';
			}
		};
		return CommentStub;
	}( config_types );

	var parse_Parser_getComment__getComment = function( types, CommentStub ) {

		return function( token ) {
			if ( token.type === types.COMMENT ) {
				this.pos += 1;
				return new CommentStub( token, this.preserveWhitespace );
			}
			return null;
		};
	}( config_types, parse_Parser_getComment_CommentStub__CommentStub );

	var parse_Parser_getMustache_ExpressionStub = function( types, isObject ) {

		var ExpressionStub = function( token ) {
			this.refs = [];
			getRefs( token, this.refs );
			this.str = stringify( token, this.refs );
		};
		ExpressionStub.prototype = {
			toJSON: function() {
				if ( !this.json ) {
					this.json = {
						r: this.refs,
						s: this.str
					};
				}
				return this.json;
			}
		};
		return ExpressionStub;

		function quoteStringLiteral( str ) {
			return JSON.stringify( String( str ) );
		}
		// TODO maybe refactor this?
		function getRefs( token, refs ) {
			var i, list;
			if ( token.t === types.REFERENCE ) {
				if ( refs.indexOf( token.n ) === -1 ) {
					refs.unshift( token.n );
				}
			}
			list = token.o || token.m;
			if ( list ) {
				if ( isObject( list ) ) {
					getRefs( list, refs );
				} else {
					i = list.length;
					while ( i-- ) {
						getRefs( list[ i ], refs );
					}
				}
			}
			if ( token.x ) {
				getRefs( token.x, refs );
			}
			if ( token.r ) {
				getRefs( token.r, refs );
			}
			if ( token.v ) {
				getRefs( token.v, refs );
			}
		}

		function stringify( token, refs ) {
			var map = function( item ) {
				return stringify( item, refs );
			};
			switch ( token.t ) {
				case types.BOOLEAN_LITERAL:
				case types.GLOBAL:
				case types.NUMBER_LITERAL:
					return token.v;
				case types.STRING_LITERAL:
					return quoteStringLiteral( token.v );
				case types.ARRAY_LITERAL:
					return '[' + ( token.m ? token.m.map( map ).join( ',' ) : '' ) + ']';
				case types.OBJECT_LITERAL:
					return '{' + ( token.m ? token.m.map( map ).join( ',' ) : '' ) + '}';
				case types.KEY_VALUE_PAIR:
					return token.k + ':' + stringify( token.v, refs );
				case types.PREFIX_OPERATOR:
					return ( token.s === 'typeof' ? 'typeof ' : token.s ) + stringify( token.o, refs );
				case types.INFIX_OPERATOR:
					return stringify( token.o[ 0 ], refs ) + ( token.s.substr( 0, 2 ) === 'in' ? ' ' + token.s + ' ' : token.s ) + stringify( token.o[ 1 ], refs );
				case types.INVOCATION:
					return stringify( token.x, refs ) + '(' + ( token.o ? token.o.map( map ).join( ',' ) : '' ) + ')';
				case types.BRACKETED:
					return '(' + stringify( token.x, refs ) + ')';
				case types.MEMBER:
					return stringify( token.x, refs ) + stringify( token.r, refs );
				case types.REFINEMENT:
					return token.n ? '.' + token.n : '[' + stringify( token.x, refs ) + ']';
				case types.CONDITIONAL:
					return stringify( token.o[ 0 ], refs ) + '?' + stringify( token.o[ 1 ], refs ) + ':' + stringify( token.o[ 2 ], refs );
				case types.REFERENCE:
					return '${' + refs.indexOf( token.n ) + '}';
				default:
					throw new Error( 'Could not stringify expression token. This error is unexpected' );
			}
		}
	}( config_types, utils_isObject );

	var parse_Parser_getMustache_KeypathExpressionStub = function( types, ExpressionStub ) {

		var KeypathExpressionStub;
		KeypathExpressionStub = function( token ) {
			this.json = {
				r: token.r,
				m: token.m.map( jsonify )
			};
		};
		KeypathExpressionStub.prototype = {
			toJSON: function() {
				return this.json;
			}
		};
		return KeypathExpressionStub;

		function jsonify( member ) {
			// Straightforward property, e.g. `foo.bar`?
			if ( member.n ) {
				return member.n;
			}
			// String or number literal, e.g. `foo["bar"]` or `foo[1]`?
			if ( member.x.t === types.STRING_LITERAL || member.x.t === types.NUMBER_LITERAL ) {
				return member.x.v;
			}
			// Straightforward reference, e.g. `foo[bar]`?
			if ( member.x.t === types.REFERENCE ) {
				return member.x;
			}
			// If none of the above, we need to process the AST
			return new ExpressionStub( member.x ).toJSON();
		}
	}( config_types, parse_Parser_getMustache_ExpressionStub );

	var parse_Parser_getMustache_MustacheStub = function( types, KeypathExpressionStub, ExpressionStub ) {

		var MustacheStub = function( token, parser ) {
			this.type = token.type === types.TRIPLE ? types.TRIPLE : token.mustacheType;
			if ( token.ref ) {
				this.ref = token.ref;
			}
			if ( token.keypathExpression ) {
				this.keypathExpr = new KeypathExpressionStub( token.keypathExpression );
			}
			if ( token.expression ) {
				this.expr = new ExpressionStub( token.expression );
			}
			parser.pos += 1;
		};
		MustacheStub.prototype = {
			toJSON: function() {
				var json;
				if ( this.json ) {
					return this.json;
				}
				json = {
					t: this.type
				};
				if ( this.ref ) {
					json.r = this.ref;
				}
				if ( this.keypathExpr ) {
					json.kx = this.keypathExpr.toJSON();
				}
				if ( this.expr ) {
					json.x = this.expr.toJSON();
				}
				this.json = json;
				return json;
			},
			toString: function() {
				// mustaches cannot be stringified
				return false;
			}
		};
		return MustacheStub;
	}( config_types, parse_Parser_getMustache_KeypathExpressionStub, parse_Parser_getMustache_ExpressionStub );

	var parse_Parser_utils_stringifyStubs = function( items ) {
		var str = '',
			itemStr, i, len;
		if ( !items ) {
			return '';
		}
		for ( i = 0, len = items.length; i < len; i += 1 ) {
			itemStr = items[ i ].toString();
			if ( itemStr === false ) {
				return false;
			}
			str += itemStr;
		}
		return str;
	};

	var parse_Parser_utils_jsonifyStubs = function( stringifyStubs ) {

		return function( items, noStringify, topLevel ) {
			var str, json;
			if ( !topLevel && !noStringify ) {
				str = stringifyStubs( items );
				if ( str !== false ) {
					return str;
				}
			}
			json = items.map( function( item ) {
				return item.toJSON( noStringify );
			} );
			return json;
		};
	}( parse_Parser_utils_stringifyStubs );

	var parse_Parser_getMustache_SectionStub = function( types, normaliseKeypath, jsonifyStubs, KeypathExpressionStub, ExpressionStub ) {

		var SectionStub = function( firstToken, parser ) {
			var next;
			this.ref = firstToken.ref;
			this.indexRef = firstToken.indexRef;
			this.inverted = firstToken.mustacheType === types.INVERTED;
			if ( firstToken.keypathExpression ) {
				this.keypathExpr = new KeypathExpressionStub( firstToken.keypathExpression );
			}
			if ( firstToken.expression ) {
				this.expr = new ExpressionStub( firstToken.expression );
			}
			parser.pos += 1;
			this.items = [];
			next = parser.next();
			while ( next ) {
				if ( next.mustacheType === types.CLOSING ) {
					validateClosing( this, next );
					parser.pos += 1;
					break;
				}
				this.items.push( parser.getStub() );
				next = parser.next();
			}
		};

		function validateClosing( stub, token ) {
			var opening = stub.ref,
				closing = normaliseKeypath( token.ref.trim() );
			if ( !opening || !closing ) {
				return;
			}
			if ( stub.indexRef ) {
				opening += ':' + stub.indexRef;
			}
			if ( opening.substr( 0, closing.length ) !== closing ) {
				throw new Error( 'Could not parse template: Illegal closing section {{/' + closing + '}}. Expected {{/' + stub.ref + '}}.' );
			}
		}
		SectionStub.prototype = {
			toJSON: function( noStringify ) {
				var json;
				if ( this.json ) {
					return this.json;
				}
				json = {
					t: types.SECTION
				};
				if ( this.ref ) {
					json.r = this.ref;
				}
				if ( this.indexRef ) {
					json.i = this.indexRef;
				}
				if ( this.inverted ) {
					json.n = true;
				}
				if ( this.expr ) {
					json.x = this.expr.toJSON();
				}
				if ( this.keypathExpr ) {
					json.kx = this.keypathExpr.toJSON();
				}
				if ( this.items.length ) {
					json.f = jsonifyStubs( this.items, noStringify );
				}
				this.json = json;
				return json;
			},
			toString: function() {
				// sections cannot be stringified
				return false;
			}
		};
		return SectionStub;
	}( config_types, utils_normaliseKeypath, parse_Parser_utils_jsonifyStubs, parse_Parser_getMustache_KeypathExpressionStub, parse_Parser_getMustache_ExpressionStub );

	var parse_Parser_getMustache__getMustache = function( types, MustacheStub, SectionStub ) {

		return function( token ) {
			if ( token.type === types.MUSTACHE || token.type === types.TRIPLE ) {
				if ( token.mustacheType === types.SECTION || token.mustacheType === types.INVERTED ) {
					return new SectionStub( token, this );
				}
				return new MustacheStub( token, this );
			}
		};
	}( config_types, parse_Parser_getMustache_MustacheStub, parse_Parser_getMustache_SectionStub );

	var parse_Parser_getElement_ElementStub_utils_siblingsByTagName = {
		li: [ 'li' ],
		dt: [
			'dt',
			'dd'
		],
		dd: [
			'dt',
			'dd'
		],
		p: 'address article aside blockquote dir div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hgroup hr menu nav ol p pre section table ul'.split( ' ' ),
		rt: [
			'rt',
			'rp'
		],
		rp: [
			'rp',
			'rt'
		],
		optgroup: [ 'optgroup' ],
		option: [
			'option',
			'optgroup'
		],
		thead: [
			'tbody',
			'tfoot'
		],
		tbody: [
			'tbody',
			'tfoot'
		],
		tr: [ 'tr' ],
		td: [
			'td',
			'th'
		],
		th: [
			'td',
			'th'
		]
	};

	var parse_Parser_getElement_ElementStub_utils_filterAttributes = function( isArray ) {

		return function( items ) {
			var attrs, proxies, filtered, i, len, item;
			filtered = {};
			attrs = [];
			proxies = [];
			len = items.length;
			for ( i = 0; i < len; i += 1 ) {
				item = items[ i ];
				// Transition?
				if ( item.name === 'intro' ) {
					if ( filtered.intro ) {
						throw new Error( 'An element can only have one intro transition' );
					}
					filtered.intro = item;
				} else if ( item.name === 'outro' ) {
					if ( filtered.outro ) {
						throw new Error( 'An element can only have one outro transition' );
					}
					filtered.outro = item;
				} else if ( item.name === 'intro-outro' ) {
					if ( filtered.intro || filtered.outro ) {
						throw new Error( 'An element can only have one intro and one outro transition' );
					}
					filtered.intro = item;
					filtered.outro = deepClone( item );
				} else if ( item.name.substr( 0, 6 ) === 'proxy-' ) {
					item.name = item.name.substring( 6 );
					proxies.push( item );
				} else if ( item.name.substr( 0, 3 ) === 'on-' ) {
					item.name = item.name.substring( 3 );
					proxies.push( item );
				} else if ( item.name === 'decorator' ) {
					filtered.decorator = item;
				} else {
					attrs.push( item );
				}
			}
			filtered.attrs = attrs;
			filtered.proxies = proxies;
			return filtered;
		};

		function deepClone( obj ) {
			var result, key;
			if ( typeof obj !== 'object' ) {
				return obj;
			}
			if ( isArray( obj ) ) {
				return obj.map( deepClone );
			}
			result = {};
			for ( key in obj ) {
				if ( obj.hasOwnProperty( key ) ) {
					result[ key ] = deepClone( obj[ key ] );
				}
			}
			return result;
		}
	}( utils_isArray );

	var parse_Parser_getElement_ElementStub_utils_processDirective = function( types, parseJSON ) {

		return function( directive ) {
			var processed, tokens, token, colonIndex, throwError, directiveName, directiveArgs, parsed;
			throwError = function() {
				throw new Error( 'Illegal directive' );
			};
			if ( !directive.name || !directive.value ) {
				throwError();
			}
			processed = {
				directiveType: directive.name
			};
			tokens = directive.value;
			directiveName = [];
			directiveArgs = [];
			while ( tokens.length ) {
				token = tokens.shift();
				if ( token.type === types.TEXT ) {
					colonIndex = token.value.indexOf( ':' );
					if ( colonIndex === -1 ) {
						directiveName.push( token );
					} else {
						// is the colon the first character?
						if ( colonIndex ) {
							// no
							directiveName.push( {
								type: types.TEXT,
								value: token.value.substr( 0, colonIndex )
							} );
						}
						// if there is anything after the colon in this token, treat
						// it as the first token of the directiveArgs fragment
						if ( token.value.length > colonIndex + 1 ) {
							directiveArgs[ 0 ] = {
								type: types.TEXT,
								value: token.value.substring( colonIndex + 1 )
							};
						}
						break;
					}
				} else {
					directiveName.push( token );
				}
			}
			directiveArgs = directiveArgs.concat( tokens );
			if ( directiveName.length === 1 && directiveName[ 0 ].type === types.TEXT ) {
				processed.name = directiveName[ 0 ].value;
			} else {
				processed.name = directiveName;
			}
			if ( directiveArgs.length ) {
				if ( directiveArgs.length === 1 && directiveArgs[ 0 ].type === types.TEXT ) {
					parsed = parseJSON( '[' + directiveArgs[ 0 ].value + ']' );
					processed.args = parsed ? parsed.value : directiveArgs[ 0 ].value;
				} else {
					processed.dynamicArgs = directiveArgs;
				}
			}
			return processed;
		};
	}( config_types, utils_parseJSON );

	var parse_Parser_StringStub_StringParser = function( getText, getMustache ) {

		var StringParser;
		StringParser = function( tokens, options ) {
			// TODO what are the options?
			var stub;
			this.tokens = tokens || [];
			this.pos = 0;
			this.options = options;
			this.result = [];
			while ( stub = this.getStub() ) {
				this.result.push( stub );
			}
		};
		StringParser.prototype = {
			getStub: function() {
				var token = this.next();
				if ( !token ) {
					return null;
				}
				return this.getText( token ) || this.getMustache( token );
			},
			getText: getText,
			getMustache: getMustache,
			next: function() {
				return this.tokens[ this.pos ];
			}
		};
		return StringParser;
	}( parse_Parser_getText__getText, parse_Parser_getMustache__getMustache );

	var parse_Parser_StringStub__StringStub = function( StringParser, stringifyStubs, jsonifyStubs ) {

		var StringStub;
		StringStub = function( tokens ) {
			var parser = new StringParser( tokens );
			this.stubs = parser.result;
		};
		StringStub.prototype = {
			toJSON: function( noStringify ) {
				var json;
				if ( this[ 'json_' + noStringify ] ) {
					return this[ 'json_' + noStringify ];
				}
				json = this[ 'json_' + noStringify ] = jsonifyStubs( this.stubs, noStringify );
				return json;
			},
			toString: function() {
				if ( this.str !== undefined ) {
					return this.str;
				}
				this.str = stringifyStubs( this.stubs );
				return this.str;
			}
		};
		return StringStub;
	}( parse_Parser_StringStub_StringParser, parse_Parser_utils_stringifyStubs, parse_Parser_utils_jsonifyStubs );

	var parse_Parser_getElement_ElementStub_utils_jsonifyDirective = function( StringStub ) {

		return function( directive ) {
			var result, name;
			if ( typeof directive.name === 'string' ) {
				if ( !directive.args && !directive.dynamicArgs ) {
					return directive.name;
				}
				name = directive.name;
			} else {
				name = new StringStub( directive.name ).toJSON();
			}
			result = {
				n: name
			};
			if ( directive.args ) {
				result.a = directive.args;
				return result;
			}
			if ( directive.dynamicArgs ) {
				result.d = new StringStub( directive.dynamicArgs ).toJSON();
			}
			return result;
		};
	}( parse_Parser_StringStub__StringStub );

	var parse_Parser_getElement_ElementStub_toJSON = function( types, jsonifyStubs, jsonifyDirective ) {

		return function( noStringify ) {
			var json, name, value, proxy, i, len, attribute;
			if ( this[ 'json_' + noStringify ] ) {
				return this[ 'json_' + noStringify ];
			}
			json = {
				t: types.ELEMENT,
				e: this.tag
			};
			if ( this.doctype ) {
				json.y = 1;
			}
			if ( this.attributes && this.attributes.length ) {
				json.a = {};
				len = this.attributes.length;
				for ( i = 0; i < len; i += 1 ) {
					attribute = this.attributes[ i ];
					name = attribute.name;
					if ( json.a[ name ] ) {
						throw new Error( 'You cannot have multiple attributes with the same name' );
					}
					// empty attributes (e.g. autoplay, checked)
					if ( attribute.value === null ) {
						value = null;
					} else {
						//value = jsonifyStubs( attribute.value, noStringify );
						value = attribute.value.toJSON( noStringify );
					}
					json.a[ name ] = value;
				}
			}
			if ( this.items && this.items.length ) {
				json.f = jsonifyStubs( this.items, noStringify );
			}
			if ( this.proxies && this.proxies.length ) {
				json.v = {};
				len = this.proxies.length;
				for ( i = 0; i < len; i += 1 ) {
					proxy = this.proxies[ i ];
					json.v[ proxy.directiveType ] = jsonifyDirective( proxy );
				}
			}
			if ( this.intro ) {
				json.t1 = jsonifyDirective( this.intro );
			}
			if ( this.outro ) {
				json.t2 = jsonifyDirective( this.outro );
			}
			if ( this.decorator ) {
				json.o = jsonifyDirective( this.decorator );
			}
			this[ 'json_' + noStringify ] = json;
			return json;
		};
	}( config_types, parse_Parser_utils_jsonifyStubs, parse_Parser_getElement_ElementStub_utils_jsonifyDirective );

	var parse_Parser_getElement_ElementStub_toString = function( stringifyStubs, voidElementNames ) {

		var htmlElements;
		htmlElements = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split( ' ' );
		return function() {
			var str, i, len, attrStr, name, attrValueStr, fragStr, isVoid;
			if ( this.str !== undefined ) {
				return this.str;
			}
			// if this isn't an HTML element, it can't be stringified (since the only reason to stringify an
			// element is to use with innerHTML, and SVG doesn't support that method.
			// Note: table elements and select children are excluded from this, because IE (of course)
			// fucks up when you use innerHTML with them
			if ( htmlElements.indexOf( this.tag.toLowerCase() ) === -1 ) {
				return this.str = false;
			}
			// do we have proxies or transitions or a decorator? if so we can't use innerHTML
			if ( this.proxies || this.intro || this.outro || this.decorator ) {
				return this.str = false;
			}
			// see if children can be stringified (i.e. don't contain mustaches)
			fragStr = stringifyStubs( this.items );
			if ( fragStr === false ) {
				return this.str = false;
			}
			// is this a void element?
			isVoid = voidElementNames.indexOf( this.tag.toLowerCase() ) !== -1;
			str = '<' + this.tag;
			if ( this.attributes ) {
				for ( i = 0, len = this.attributes.length; i < len; i += 1 ) {
					name = this.attributes[ i ].name;
					// does this look like a namespaced attribute? if so we can't stringify it
					if ( name.indexOf( ':' ) !== -1 ) {
						return this.str = false;
					}
					// if this element has an id attribute, it can't be stringified (since references are stored
					// in ractive.nodes). Similarly, intro and outro transitions
					if ( name === 'id' || name === 'intro' || name === 'outro' ) {
						return this.str = false;
					}
					attrStr = ' ' + name;
					// empty attributes
					if ( this.attributes[ i ].value !== null ) {
						attrValueStr = this.attributes[ i ].value.toString();
						if ( attrValueStr === false ) {
							return this.str = false;
						}
						if ( attrValueStr !== '' ) {
							attrStr += '=';
							// does it need to be quoted?
							if ( /[\s"'=<>`]/.test( attrValueStr ) ) {
								attrStr += '"' + attrValueStr.replace( /"/g, '&quot;' ) + '"';
							} else {
								attrStr += attrValueStr;
							}
						}
					}
					str += attrStr;
				}
			}
			// if this isn't a void tag, but is self-closing, add a solidus. Aaaaand, we're done
			if ( this.selfClosing && !isVoid ) {
				str += '/>';
				return this.str = str;
			}
			str += '>';
			// void element? we're done
			if ( isVoid ) {
				return this.str = str;
			}
			// if this has children, add them
			str += fragStr;
			str += '</' + this.tag + '>';
			return this.str = str;
		};
	}( parse_Parser_utils_stringifyStubs, config_voidElementNames );

	var parse_Parser_getElement_ElementStub__ElementStub = function( types, voidElementNames, warn, siblingsByTagName, filterAttributes, processDirective, toJSON, toString, StringStub ) {

		var ElementStub,
			// helpers
			allElementNames, closedByParentClose, onPattern, sanitize, leadingWhitespace = /^\s+/,
			trailingWhitespace = /\s+$/;
		ElementStub = function( firstToken, parser, preserveWhitespace ) {
			var next, attrs, filtered, proxies, item, getFrag, lowerCaseTag;
			parser.pos += 1;
			getFrag = function( attr ) {
				return {
					name: attr.name,
					value: attr.value ? new StringStub( attr.value ) : null
				};
			};
			// enforce lower case tag names by default. HTML doesn't care. SVG does, so if we see an SVG tag
			// that should be camelcased, camelcase it
			this.tag = firstToken.name;
			lowerCaseTag = firstToken.name.toLowerCase();
			if ( lowerCaseTag.substr( 0, 3 ) === 'rv-' ) {
				warn( 'The "rv-" prefix for components has been deprecated. Support will be removed in a future version' );
				this.tag = this.tag.substring( 3 );
			}
			// if this is a <pre> element, preserve whitespace within
			preserveWhitespace = preserveWhitespace || lowerCaseTag === 'pre' || lowerCaseTag === 'style' || lowerCaseTag === 'script';
			if ( firstToken.attrs ) {
				filtered = filterAttributes( firstToken.attrs );
				attrs = filtered.attrs;
				proxies = filtered.proxies;
				// remove event attributes (e.g. onclick='doSomething()') if we're sanitizing
				if ( parser.options.sanitize && parser.options.sanitize.eventAttributes ) {
					attrs = attrs.filter( sanitize );
				}
				if ( attrs.length ) {
					this.attributes = attrs.map( getFrag );
				}
				// Process directives (proxy events, transitions, and decorators)
				if ( proxies.length ) {
					this.proxies = proxies.map( processDirective );
				}
				if ( filtered.intro ) {
					this.intro = processDirective( filtered.intro );
				}
				if ( filtered.outro ) {
					this.outro = processDirective( filtered.outro );
				}
				if ( filtered.decorator ) {
					this.decorator = processDirective( filtered.decorator );
				}
			}
			if ( firstToken.doctype ) {
				this.doctype = true;
			}
			if ( firstToken.selfClosing ) {
				this.selfClosing = true;
			}
			if ( voidElementNames.indexOf( lowerCaseTag ) !== -1 ) {
				this.isVoid = true;
			}
			// if self-closing or a void element, close
			if ( this.selfClosing || this.isVoid ) {
				return;
			}
			this.siblings = siblingsByTagName[ lowerCaseTag ];
			this.items = [];
			next = parser.next();
			while ( next ) {
				// section closing mustache should also close this element, e.g.
				// <ul>{{#items}}<li>{{content}}{{/items}}</ul>
				if ( next.mustacheType === types.CLOSING ) {
					break;
				}
				if ( next.type === types.TAG ) {
					// closing tag
					if ( next.closing ) {
						// it's a closing tag, which means this element is closed...
						if ( next.name.toLowerCase() === lowerCaseTag ) {
							parser.pos += 1;
						}
						break;
					} else if ( this.siblings && this.siblings.indexOf( next.name.toLowerCase() ) !== -1 ) {
						break;
					}
				}
				this.items.push( parser.getStub( preserveWhitespace ) );
				next = parser.next();
			}
			// if we're not preserving whitespace, we can eliminate inner leading and trailing whitespace
			if ( !preserveWhitespace ) {
				item = this.items[ 0 ];
				if ( item && item.type === types.TEXT ) {
					item.text = item.text.replace( leadingWhitespace, '' );
					if ( !item.text ) {
						this.items.shift();
					}
				}
				item = this.items[ this.items.length - 1 ];
				if ( item && item.type === types.TEXT ) {
					item.text = item.text.replace( trailingWhitespace, '' );
					if ( !item.text ) {
						this.items.pop();
					}
				}
			}
		};
		ElementStub.prototype = {
			toJSON: toJSON,
			toString: toString
		};
		allElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split( ' ' );
		closedByParentClose = 'li dd rt rp optgroup option tbody tfoot tr td th'.split( ' ' );
		onPattern = /^on[a-zA-Z]/;
		sanitize = function( attr ) {
			var valid = !onPattern.test( attr.name );
			return valid;
		};
		return ElementStub;
	}( config_types, config_voidElementNames, utils_warn, parse_Parser_getElement_ElementStub_utils_siblingsByTagName, parse_Parser_getElement_ElementStub_utils_filterAttributes, parse_Parser_getElement_ElementStub_utils_processDirective, parse_Parser_getElement_ElementStub_toJSON, parse_Parser_getElement_ElementStub_toString, parse_Parser_StringStub__StringStub );

	var parse_Parser_getElement__getElement = function( ElementStub ) {

		return function( token ) {
			// sanitize
			if ( this.options.sanitize && this.options.sanitize.elements ) {
				if ( this.options.sanitize.elements.indexOf( token.name.toLowerCase() ) !== -1 ) {
					return null;
				}
			}
			return new ElementStub( token, this, this.preserveWhitespace );
		};
	}( parse_Parser_getElement_ElementStub__ElementStub );

	var parse_Parser__Parser = function( getText, getComment, getMustache, getElement, jsonifyStubs ) {

		var Parser;
		Parser = function( tokens, options ) {
			var stub, stubs;
			this.tokens = tokens || [];
			this.pos = 0;
			this.options = options;
			this.preserveWhitespace = options.preserveWhitespace;
			stubs = [];
			while ( stub = this.getStub() ) {
				stubs.push( stub );
			}
			this.result = jsonifyStubs( stubs, options.noStringify, true );
		};
		Parser.prototype = {
			getStub: function( preserveWhitespace ) {
				var token = this.next();
				if ( !token ) {
					return null;
				}
				return this.getText( token, this.preserveWhitespace || preserveWhitespace ) || this.getComment( token ) || this.getMustache( token ) || this.getElement( token );
			},
			getText: getText,
			getComment: getComment,
			getMustache: getMustache,
			getElement: getElement,
			next: function() {
				return this.tokens[ this.pos ];
			}
		};
		return Parser;
	}( parse_Parser_getText__getText, parse_Parser_getComment__getComment, parse_Parser_getMustache__getMustache, parse_Parser_getElement__getElement, parse_Parser_utils_jsonifyStubs );

	// Ractive.parse
	// ===============
	//
	// Takes in a string, and returns an object representing the parsed template.
	// A parsed template is an array of 1 or more 'descriptors', which in some
	// cases have children.
	//
	// The format is optimised for size, not readability, however for reference the
	// keys for each descriptor are as follows:
	//
	// * r - Reference, e.g. 'mustache' in {{mustache}}
	// * t - Type code (e.g. 1 is text, 2 is interpolator...)
	// * f - Fragment. Contains a descriptor's children
	// * e - Element name
	// * a - map of element Attributes, or proxy event/transition Arguments
	// * d - Dynamic proxy event/transition arguments
	// * n - indicates an iNverted section
	// * i - Index reference, e.g. 'num' in {{#section:num}}content{{/section}}
	// * v - eVent proxies (i.e. when user e.g. clicks on a node, fire proxy event)
	// * x - eXpressions
	// * s - String representation of an expression function
	// * t1 - intro Transition
	// * t2 - outro Transition
	// * o - decOrator
	// * y - is doctYpe
	var parse__parse = function( tokenize, types, Parser ) {

		var parse, onlyWhitespace, inlinePartialStart, inlinePartialEnd, parseCompoundTemplate;
		onlyWhitespace = /^\s*$/;
		inlinePartialStart = /<!--\s*\{\{\s*>\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*}\}\s*-->/;
		inlinePartialEnd = /<!--\s*\{\{\s*\/\s*([a-zA-Z_$][a-zA-Z_$0-9]*)\s*}\}\s*-->/;
		parse = function( template, options ) {
			var tokens, json, token;
			options = options || {};
			// does this template include inline partials?
			if ( inlinePartialStart.test( template ) ) {
				return parseCompoundTemplate( template, options );
			}
			if ( options.sanitize === true ) {
				options.sanitize = {
					// blacklist from https://code.google.com/p/google-caja/source/browse/trunk/src/com/google/caja/lang/html/html4-elements-whitelist.json
					elements: 'applet base basefont body frame frameset head html isindex link meta noframes noscript object param script style title'.split( ' ' ),
					eventAttributes: true
				};
			}
			tokens = tokenize( template, options );
			if ( !options.preserveWhitespace ) {
				// remove first token if it only contains whitespace
				token = tokens[ 0 ];
				if ( token && token.type === types.TEXT && onlyWhitespace.test( token.value ) ) {
					tokens.shift();
				}
				// ditto last token
				token = tokens[ tokens.length - 1 ];
				if ( token && token.type === types.TEXT && onlyWhitespace.test( token.value ) ) {
					tokens.pop();
				}
			}
			json = new Parser( tokens, options ).result;
			if ( typeof json === 'string' ) {
				// If we return it as a string, Ractive will attempt to reparse it!
				// Instead we wrap it in an array. Ractive knows what to do then
				return [ json ];
			}
			return json;
		};
		parseCompoundTemplate = function( template, options ) {
			var mainTemplate, remaining, partials, name, startMatch, endMatch;
			partials = {};
			mainTemplate = '';
			remaining = template;
			while ( startMatch = inlinePartialStart.exec( remaining ) ) {
				name = startMatch[ 1 ];
				mainTemplate += remaining.substr( 0, startMatch.index );
				remaining = remaining.substring( startMatch.index + startMatch[ 0 ].length );
				endMatch = inlinePartialEnd.exec( remaining );
				if ( !endMatch || endMatch[ 1 ] !== name ) {
					throw new Error( 'Inline partials must have a closing delimiter, and cannot be nested' );
				}
				partials[ name ] = parse( remaining.substr( 0, endMatch.index ), options );
				remaining = remaining.substring( endMatch.index + endMatch[ 0 ].length );
			}
			return {
				main: parse( mainTemplate, options ),
				partials: partials
			};
		};
		return parse;
	}( parse_tokenize, config_types, parse_Parser__Parser );

	var render_DomFragment_Partial_deIndent = function() {

		var empty = /^\s*$/,
			leadingWhitespace = /^\s*/;
		return function( str ) {
			var lines, firstLine, lastLine, minIndent;
			lines = str.split( '\n' );
			// remove first and last line, if they only contain whitespace
			firstLine = lines[ 0 ];
			if ( firstLine !== undefined && empty.test( firstLine ) ) {
				lines.shift();
			}
			lastLine = lines[ lines.length - 1 ];
			if ( lastLine !== undefined && empty.test( lastLine ) ) {
				lines.pop();
			}
			minIndent = lines.reduce( reducer, null );
			if ( minIndent ) {
				str = lines.map( function( line ) {
					return line.replace( minIndent, '' );
				} ).join( '\n' );
			}
			return str;
		};

		function reducer( previous, line ) {
			var lineIndent = leadingWhitespace.exec( line )[ 0 ];
			if ( previous === null || lineIndent.length < previous.length ) {
				return lineIndent;
			}
			return previous;
		}
	}();

	var render_DomFragment_Partial_getPartialDescriptor = function( errors, isClient, warn, isObject, partials, parse, deIndent ) {

		var getPartialDescriptor, registerPartial, getPartialFromRegistry, unpack;
		getPartialDescriptor = function( root, name ) {
			var el, partial, errorMessage;
			// If the partial was specified on this instance, great
			if ( partial = getPartialFromRegistry( root, name ) ) {
				return partial;
			}
			// Does it exist on the page as a script tag?
			if ( isClient ) {
				el = document.getElementById( name );
				if ( el && el.tagName === 'SCRIPT' ) {
					if ( !parse ) {
						throw new Error( errors.missingParser );
					}
					registerPartial( parse( deIndent( el.text ), root.parseOptions ), name, partials );
				}
			}
			partial = partials[ name ];
			// No match? Return an empty array
			if ( !partial ) {
				errorMessage = 'Could not find descriptor for partial "' + name + '"';
				if ( root.debug ) {
					throw new Error( errorMessage );
				} else {
					warn( errorMessage );
				}
				return [];
			}
			return unpack( partial );
		};
		getPartialFromRegistry = function( ractive, name ) {
			var partial;
			if ( ractive.partials[ name ] ) {
				// If this was added manually to the registry, but hasn't been parsed,
				// parse it now
				if ( typeof ractive.partials[ name ] === 'string' ) {
					if ( !parse ) {
						throw new Error( errors.missingParser );
					}
					partial = parse( ractive.partials[ name ], ractive.parseOptions );
					registerPartial( partial, name, ractive.partials );
				}
				return unpack( ractive.partials[ name ] );
			}
		};
		registerPartial = function( partial, name, registry ) {
			var key;
			if ( isObject( partial ) ) {
				registry[ name ] = partial.main;
				for ( key in partial.partials ) {
					if ( partial.partials.hasOwnProperty( key ) ) {
						registry[ key ] = partial.partials[ key ];
					}
				}
			} else {
				registry[ name ] = partial;
			}
		};
		unpack = function( partial ) {
			// Unpack string, if necessary
			if ( partial.length === 1 && typeof partial[ 0 ] === 'string' ) {
				return partial[ 0 ];
			}
			return partial;
		};
		return getPartialDescriptor;
	}( config_errors, config_isClient, utils_warn, utils_isObject, registries_partials, parse__parse, render_DomFragment_Partial_deIndent );

	var render_DomFragment_Partial_applyIndent = function( string, indent ) {
		var indented;
		if ( !indent ) {
			return string;
		}
		indented = string.split( '\n' ).map( function( line, notFirstLine ) {
			return notFirstLine ? indent + line : line;
		} ).join( '\n' );
		return indented;
	};

	var render_DomFragment_Partial__Partial = function( types, getPartialDescriptor, applyIndent, circular ) {

		var DomPartial, DomFragment;
		circular.push( function() {
			DomFragment = circular.DomFragment;
		} );
		DomPartial = function( options, docFrag ) {
			var parentFragment = this.parentFragment = options.parentFragment,
				descriptor;
			this.type = types.PARTIAL;
			this.name = options.descriptor.r;
			this.index = options.index;
			if ( !options.descriptor.r ) {
				// TODO support dynamic partial switching
				throw new Error( 'Partials must have a static reference (no expressions). This may change in a future version of Ractive.' );
			}
			descriptor = getPartialDescriptor( parentFragment.root, options.descriptor.r );
			this.fragment = new DomFragment( {
				descriptor: descriptor,
				root: parentFragment.root,
				pNode: parentFragment.pNode,
				owner: this
			} );
			if ( docFrag ) {
				docFrag.appendChild( this.fragment.docFrag );
			}
		};
		DomPartial.prototype = {
			firstNode: function() {
				return this.fragment.firstNode();
			},
			findNextNode: function() {
				return this.parentFragment.findNextNode( this );
			},
			detach: function() {
				return this.fragment.detach();
			},
			reassign: function( indexRef, newIndex, oldKeypath, newKeypath ) {
				return this.fragment.reassign( indexRef, newIndex, oldKeypath, newKeypath );
			},
			teardown: function( destroy ) {
				this.fragment.teardown( destroy );
			},
			toString: function() {
				var string, previousItem, lastLine, match;
				string = this.fragment.toString();
				previousItem = this.parentFragment.items[ this.index - 1 ];
				if ( !previousItem || previousItem.type !== types.TEXT ) {
					return string;
				}
				lastLine = previousItem.descriptor.split( '\n' ).pop();
				if ( match = /^\s+$/.exec( lastLine ) ) {
					return applyIndent( string, match[ 0 ] );
				}
				return string;
			},
			find: function( selector ) {
				return this.fragment.find( selector );
			},
			findAll: function( selector, query ) {
				return this.fragment.findAll( selector, query );
			},
			findComponent: function( selector ) {
				return this.fragment.findComponent( selector );
			},
			findAllComponents: function( selector, query ) {
				return this.fragment.findAllComponents( selector, query );
			}
		};
		return DomPartial;
	}( config_types, render_DomFragment_Partial_getPartialDescriptor, render_DomFragment_Partial_applyIndent, circular );

	var render_DomFragment_Component_initialise_createModel_ComponentParameter = function( runloop, StringFragment ) {

		var ComponentParameter = function( component, key, value ) {
			this.parentFragment = component.parentFragment;
			this.component = component;
			this.key = key;
			this.fragment = new StringFragment( {
				descriptor: value,
				root: component.root,
				owner: this
			} );
			this.selfUpdating = this.fragment.isSimple();
			this.value = this.fragment.getValue();
		};
		ComponentParameter.prototype = {
			bubble: function() {
				// If there's a single item, we can update the component immediately...
				if ( this.selfUpdating ) {
					this.update();
				} else if ( !this.deferred && this.ready ) {
					runloop.addAttribute( this );
					this.deferred = true;
				}
			},
			update: function() {
				var value = this.fragment.getValue();
				this.component.instance.set( this.key, value );
				this.value = value;
			},
			teardown: function() {
				this.fragment.teardown();
			}
		};
		return ComponentParameter;
	}( global_runloop, render_StringFragment__StringFragment );

	var render_DomFragment_Component_initialise_createModel__createModel = function( types, parseJSON, resolveRef, get, ComponentParameter ) {

		return function( component, defaultData, attributes, toBind ) {
			var data, key, value;
			data = {};
			// some parameters, e.g. foo="The value is {{bar}}", are 'complex' - in
			// other words, we need to construct a string fragment to watch
			// when they change. We store these so they can be torn down later
			component.complexParameters = [];
			for ( key in attributes ) {
				if ( attributes.hasOwnProperty( key ) ) {
					value = getValue( component, key, attributes[ key ], toBind );
					if ( value !== undefined || defaultData[ key ] === undefined ) {
						data[ key ] = value;
					}
				}
			}
			return data;
		};

		function getValue( component, key, descriptor, toBind ) {
			var parameter, parsed, parentInstance, parentFragment, keypath, indexRef;
			parentInstance = component.root;
			parentFragment = component.parentFragment;
			// If this is a static value, great
			if ( typeof descriptor === 'string' ) {
				parsed = parseJSON( descriptor );
				return parsed ? parsed.value : descriptor;
			}
			// If null, we treat it as a boolean attribute (i.e. true)
			if ( descriptor === null ) {
				return true;
			}
			// If a regular interpolator, we bind to it
			if ( descriptor.length === 1 && descriptor[ 0 ].t === types.INTERPOLATOR && descriptor[ 0 ].r ) {
				// Is it an index reference?
				if ( parentFragment.indexRefs && parentFragment.indexRefs[ indexRef = descriptor[ 0 ].r ] !== undefined ) {
					component.indexRefBindings[ indexRef ] = key;
					return parentFragment.indexRefs[ indexRef ];
				}
				// TODO what about references that resolve late? Should these be considered?
				keypath = resolveRef( parentInstance, descriptor[ 0 ].r, parentFragment ) || descriptor[ 0 ].r;
				// We need to set up bindings between parent and child, but
				// we can't do it yet because the child instance doesn't exist
				// yet - so we make a note instead
				toBind.push( {
					childKeypath: key,
					parentKeypath: keypath
				} );
				return get( parentInstance, keypath );
			}
			// We have a 'complex parameter' - we need to create a full-blown string
			// fragment in order to evaluate and observe its value
			parameter = new ComponentParameter( component, key, descriptor );
			component.complexParameters.push( parameter );
			return parameter.value;
		}
	}( config_types, utils_parseJSON, shared_resolveRef, shared_get__get, render_DomFragment_Component_initialise_createModel_ComponentParameter );

	var render_DomFragment_Component_initialise_createInstance = function() {

		return function( component, Component, data, docFrag, contentDescriptor ) {
			var instance, parentFragment, partials, root, adapt;
			parentFragment = component.parentFragment;
			root = component.root;
			// Make contents available as a {{>content}} partial
			partials = {
				content: contentDescriptor || []
			};
			// Use component default adaptors AND inherit parent adaptors.
			adapt = combineAdaptors( root, Component.defaults.adapt, Component.adaptors );
			instance = new Component( {
				el: parentFragment.pNode,
				append: true,
				data: data,
				partials: partials,
				magic: root.magic || Component.defaults.magic,
				modifyArrays: root.modifyArrays,
				_parent: root,
				_component: component,
				adapt: adapt
			} );
			if ( docFrag ) {
				// The component may be in the wrong place! This is because we
				// are still populating the document fragment that will be appended
				// to its parent node. So even though the component is *already*
				// a child of the parent node, we need to detach it, then insert
				// it into said document fragment, so that order is maintained
				// (both figuratively and literally).
				instance.insert( docFrag );
				// (After inserting, we need to reset the node reference)
				instance.fragment.pNode = instance.el = parentFragment.pNode;
			}
			return instance;
		};

		function combineAdaptors( root, defaultAdapt ) {
			var adapt, len, i;
			// Parent adaptors should take precedence, so they go first
			if ( root.adapt.length ) {
				adapt = root.adapt.map( function( stringOrObject ) {
					if ( typeof stringOrObject === 'object' ) {
						return stringOrObject;
					}
					return root.adaptors[ stringOrObject ] || stringOrObject;
				} );
			} else {
				adapt = [];
			}
			// If the component has any adaptors that aren't already included,
			// include them now
			if ( len = defaultAdapt.length ) {
				for ( i = 0; i < len; i += 1 ) {
					if ( adapt.indexOf( defaultAdapt[ i ] ) === -1 ) {
						adapt.push( defaultAdapt[ i ] );
					}
				}
			}
			return adapt;
		}
	}();

	var render_DomFragment_Component_initialise_createBindings = function( createComponentBinding, get, set ) {

		return function createInitialComponentBindings( component, toBind ) {
			toBind.forEach( function createInitialComponentBinding( pair ) {
				var childValue, parentValue;
				createComponentBinding( component, component.root, pair.parentKeypath, pair.childKeypath );
				childValue = get( component.instance, pair.childKeypath );
				parentValue = get( component.root, pair.parentKeypath );
				if ( childValue !== undefined && parentValue === undefined ) {
					set( component.root, pair.parentKeypath, childValue );
				}
			} );
		};
	}( shared_createComponentBinding, shared_get__get, shared_set );

	var render_DomFragment_Component_initialise_propagateEvents = function( warn ) {

		// TODO how should event arguments be handled? e.g.
		// <widget on-foo='bar:1,2,3'/>
		// The event 'bar' will be fired on the parent instance
		// when 'foo' fires on the child, but the 1,2,3 arguments
		// will be lost
		var errorMessage = 'Components currently only support simple events - you cannot include arguments. Sorry!';
		return function( component, eventsDescriptor ) {
			var eventName;
			for ( eventName in eventsDescriptor ) {
				if ( eventsDescriptor.hasOwnProperty( eventName ) ) {
					propagateEvent( component.instance, component.root, eventName, eventsDescriptor[ eventName ] );
				}
			}
		};

		function propagateEvent( childInstance, parentInstance, eventName, proxyEventName ) {
			if ( typeof proxyEventName !== 'string' ) {
				if ( parentInstance.debug ) {
					throw new Error( errorMessage );
				} else {
					warn( errorMessage );
					return;
				}
			}
			childInstance.on( eventName, function() {
				var args = Array.prototype.slice.call( arguments );
				args.unshift( proxyEventName );
				parentInstance.fire.apply( parentInstance, args );
			} );
		}
	}( utils_warn );

	var render_DomFragment_Component_initialise_updateLiveQueries = function( component ) {
		var ancestor, query;
		// If there's a live query for this component type, add it
		ancestor = component.root;
		while ( ancestor ) {
			if ( query = ancestor._liveComponentQueries[ component.name ] ) {
				query.push( component.instance );
			}
			ancestor = ancestor._parent;
		}
	};

	var render_DomFragment_Component_initialise__initialise = function( types, warn, createModel, createInstance, createBindings, propagateEvents, updateLiveQueries ) {

		return function initialiseComponent( component, options, docFrag ) {
			var parentFragment, root, Component, data, toBind;
			parentFragment = component.parentFragment = options.parentFragment;
			root = parentFragment.root;
			component.root = root;
			component.type = types.COMPONENT;
			component.name = options.descriptor.e;
			component.index = options.index;
			component.indexRefBindings = {};
			component.bindings = [];
			// get the component constructor
			Component = root.components[ options.descriptor.e ];
			if ( !Component ) {
				throw new Error( 'Component "' + options.descriptor.e + '" not found' );
			}
			// First, we need to create a model for the component - e.g. if we
			// encounter <widget foo='bar'/> then we need to create a widget
			// with `data: { foo: 'bar' }`.
			//
			// This may involve setting up some bindings, but we can't do it
			// yet so we take some notes instead
			toBind = [];
			data = createModel( component, Component.data || {}, options.descriptor.a, toBind );
			createInstance( component, Component, data, docFrag, options.descriptor.f );
			createBindings( component, toBind );
			propagateEvents( component, options.descriptor.v );
			// intro, outro and decorator directives have no effect
			if ( options.descriptor.t1 || options.descriptor.t2 || options.descriptor.o ) {
				warn( 'The "intro", "outro" and "decorator" directives have no effect on components' );
			}
			updateLiveQueries( component );
		};
	}( config_types, utils_warn, render_DomFragment_Component_initialise_createModel__createModel, render_DomFragment_Component_initialise_createInstance, render_DomFragment_Component_initialise_createBindings, render_DomFragment_Component_initialise_propagateEvents, render_DomFragment_Component_initialise_updateLiveQueries );

	var render_DomFragment_Component__Component = function( initialise, getNewKeypath ) {

		var DomComponent = function( options, docFrag ) {
			initialise( this, options, docFrag );
		};
		DomComponent.prototype = {
			firstNode: function() {
				return this.instance.fragment.firstNode();
			},
			findNextNode: function() {
				return this.parentFragment.findNextNode( this );
			},
			detach: function() {
				return this.instance.fragment.detach();
			},
			teardown: function( destroy ) {
				while ( this.complexParameters.length ) {
					this.complexParameters.pop().teardown();
				}
				while ( this.bindings.length ) {
					this.bindings.pop().teardown();
				}
				removeFromLiveComponentQueries( this );
				// Add this flag so that we don't unnecessarily destroy the component's nodes
				this.shouldDestroy = destroy;
				this.instance.teardown();
			},
			reassign: function( indexRef, newIndex, oldKeypath, newKeypath ) {
				var childInstance = this.instance,
					parentInstance = childInstance._parent,
					indexRefAlias, query;
				this.bindings.forEach( function( binding ) {
					var updated;
					if ( binding.root !== parentInstance ) {
						return;
					}
					if ( binding.keypath === indexRef ) {
						childInstance.set( binding.otherKeypath, newIndex );
					}
					if ( updated = getNewKeypath( binding.keypath, oldKeypath, newKeypath ) ) {
						binding.reassign( updated );
					}
				} );
				if ( indexRefAlias = this.indexRefBindings[ indexRef ] ) {
					childInstance.set( indexRefAlias, newIndex );
				}
				if ( query = this.root._liveComponentQueries[ this.name ] ) {
					query._makeDirty();
				}
			},
			toString: function() {
				return this.instance.fragment.toString();
			},
			find: function( selector ) {
				return this.instance.fragment.find( selector );
			},
			findAll: function( selector, query ) {
				return this.instance.fragment.findAll( selector, query );
			},
			findComponent: function( selector ) {
				if ( !selector || selector === this.name ) {
					return this.instance;
				}
				if ( this.instance.fragment ) {
					return this.instance.fragment.findComponent( selector );
				}
				return null;
			},
			findAllComponents: function( selector, query ) {
				query._test( this, true );
				if ( this.instance.fragment ) {
					this.instance.fragment.findAllComponents( selector, query );
				}
			}
		};
		return DomComponent;

		function removeFromLiveComponentQueries( component ) {
			var instance, query;
			instance = component.root;
			do {
				if ( query = instance._liveComponentQueries[ component.name ] ) {
					query._remove( component );
				}
			} while ( instance = instance._parent );
		}
	}( render_DomFragment_Component_initialise__initialise, render_shared_utils_getNewKeypath );

	var render_DomFragment_Comment = function( types, detach ) {

		var DomComment = function( options, docFrag ) {
			this.type = types.COMMENT;
			this.descriptor = options.descriptor;
			if ( docFrag ) {
				this.node = document.createComment( options.descriptor.f );
				docFrag.appendChild( this.node );
			}
		};
		DomComment.prototype = {
			detach: detach,
			teardown: function( destroy ) {
				if ( destroy ) {
					this.detach();
				}
			},
			firstNode: function() {
				return this.node;
			},
			toString: function() {
				return '<!--' + this.descriptor.f + '-->';
			}
		};
		return DomComment;
	}( config_types, render_DomFragment_shared_detach );

	var render_DomFragment__DomFragment = function( types, matches, Fragment, insertHtml, Text, Interpolator, Section, Triple, Element, Partial, Component, Comment, circular ) {

		var DomFragment = function( options ) {
			if ( options.pNode ) {
				this.docFrag = document.createDocumentFragment();
			}
			// if we have an HTML string, our job is easy.
			if ( typeof options.descriptor === 'string' ) {
				this.html = options.descriptor;
				if ( this.docFrag ) {
					this.nodes = insertHtml( this.html, options.pNode.tagName, options.pNode.namespaceURI, this.docFrag );
				}
			} else {
				// otherwise we need to make a proper fragment
				Fragment.init( this, options );
			}
		};
		DomFragment.prototype = {
			reassign: Fragment.reassign,
			detach: function() {
				var len, i;
				if ( this.docFrag ) {
					// if this was built from HTML, we just need to remove the nodes
					if ( this.nodes ) {
						len = this.nodes.length;
						for ( i = 0; i < len; i += 1 ) {
							this.docFrag.appendChild( this.nodes[ i ] );
						}
					} else if ( this.items ) {
						len = this.items.length;
						for ( i = 0; i < len; i += 1 ) {
							this.docFrag.appendChild( this.items[ i ].detach() );
						}
					}
					return this.docFrag;
				}
			},
			createItem: function( options ) {
				if ( typeof options.descriptor === 'string' ) {
					return new Text( options, this.docFrag );
				}
				switch ( options.descriptor.t ) {
					case types.INTERPOLATOR:
						return new Interpolator( options, this.docFrag );
					case types.SECTION:
						return new Section( options, this.docFrag );
					case types.TRIPLE:
						return new Triple( options, this.docFrag );
					case types.ELEMENT:
						if ( this.root.components[ options.descriptor.e ] ) {
							return new Component( options, this.docFrag );
						}
						return new Element( options, this.docFrag );
					case types.PARTIAL:
						return new Partial( options, this.docFrag );
					case types.COMMENT:
						return new Comment( options, this.docFrag );
					default:
						throw new Error( 'Something very strange happened. Please file an issue at https://github.com/RactiveJS/Ractive/issues. Thanks!' );
				}
			},
			teardown: function( destroy ) {
				var node;
				// if this was built from HTML, we just need to remove the nodes
				if ( this.nodes && destroy ) {
					while ( node = this.nodes.pop() ) {
						node.parentNode.removeChild( node );
					}
				} else if ( this.items ) {
					while ( this.items.length ) {
						this.items.pop().teardown( destroy );
					}
				}
				this.nodes = this.items = this.docFrag = null;
			},
			firstNode: function() {
				if ( this.items && this.items[ 0 ] ) {
					return this.items[ 0 ].firstNode();
				} else if ( this.nodes ) {
					return this.nodes[ 0 ] || null;
				}
				return null;
			},
			findNextNode: function( item ) {
				var index = item.index;
				if ( this.items[ index + 1 ] ) {
					return this.items[ index + 1 ].firstNode();
				}
				// if this is the root fragment, and there are no more items,
				// it means we're at the end...
				if ( this.owner === this.root ) {
					if ( !this.owner.component ) {
						return null;
					}
					// ...unless this is a component
					return this.owner.component.findNextNode();
				}
				return this.owner.findNextNode( this );
			},
			toString: function() {
				var html, i, len, item;
				if ( this.html ) {
					return this.html;
				}
				html = '';
				if ( !this.items ) {
					return html;
				}
				len = this.items.length;
				for ( i = 0; i < len; i += 1 ) {
					item = this.items[ i ];
					html += item.toString();
				}
				return html;
			},
			find: function( selector ) {
				var i, len, item, node, queryResult;
				if ( this.nodes ) {
					len = this.nodes.length;
					for ( i = 0; i < len; i += 1 ) {
						node = this.nodes[ i ];
						// we only care about elements
						if ( node.nodeType !== 1 ) {
							continue;
						}
						if ( matches( node, selector ) ) {
							return node;
						}
						if ( queryResult = node.querySelector( selector ) ) {
							return queryResult;
						}
					}
					return null;
				}
				if ( this.items ) {
					len = this.items.length;
					for ( i = 0; i < len; i += 1 ) {
						item = this.items[ i ];
						if ( item.find && ( queryResult = item.find( selector ) ) ) {
							return queryResult;
						}
					}
					return null;
				}
			},
			findAll: function( selector, query ) {
				var i, len, item, node, queryAllResult, numNodes, j;
				if ( this.nodes ) {
					len = this.nodes.length;
					for ( i = 0; i < len; i += 1 ) {
						node = this.nodes[ i ];
						// we only care about elements
						if ( node.nodeType !== 1 ) {
							continue;
						}
						if ( matches( node, selector ) ) {
							query.push( node );
						}
						if ( queryAllResult = node.querySelectorAll( selector ) ) {
							numNodes = queryAllResult.length;
							for ( j = 0; j < numNodes; j += 1 ) {
								query.push( queryAllResult[ j ] );
							}
						}
					}
				} else if ( this.items ) {
					len = this.items.length;
					for ( i = 0; i < len; i += 1 ) {
						item = this.items[ i ];
						if ( item.findAll ) {
							item.findAll( selector, query );
						}
					}
				}
				return query;
			},
			findComponent: function( selector ) {
				var len, i, item, queryResult;
				if ( this.items ) {
					len = this.items.length;
					for ( i = 0; i < len; i += 1 ) {
						item = this.items[ i ];
						if ( item.findComponent && ( queryResult = item.findComponent( selector ) ) ) {
							return queryResult;
						}
					}
					return null;
				}
			},
			findAllComponents: function( selector, query ) {
				var i, len, item;
				if ( this.items ) {
					len = this.items.length;
					for ( i = 0; i < len; i += 1 ) {
						item = this.items[ i ];
						if ( item.findAllComponents ) {
							item.findAllComponents( selector, query );
						}
					}
				}
				return query;
			}
		};
		circular.DomFragment = DomFragment;
		return DomFragment;
	}( config_types, utils_matches, render_shared_Fragment__Fragment, render_DomFragment_shared_insertHtml, render_DomFragment_Text, render_DomFragment_Interpolator, render_DomFragment_Section__Section, render_DomFragment_Triple, render_DomFragment_Element__Element, render_DomFragment_Partial__Partial, render_DomFragment_Component__Component, render_DomFragment_Comment, circular );

	var Ractive_prototype_render = function( runloop, css, DomFragment ) {

		return function Ractive_prototype_render( target, callback ) {
			this._rendering = true;
			runloop.start( this, callback );
			// This method is part of the API for one reason only - so that it can be
			// overwritten by components that don't want to use the templating system
			// (e.g. canvas-based components). It shouldn't be called outside of the
			// initialisation sequence!
			if ( !this._initing ) {
				throw new Error( 'You cannot call ractive.render() directly!' );
			}
			// Add CSS, if applicable
			if ( this.constructor.css ) {
				css.add( this.constructor );
			}
			// Render our *root fragment*
			this.fragment = new DomFragment( {
				descriptor: this.template,
				root: this,
				owner: this,
				// saves doing `if ( this.parent ) { /*...*/ }` later on
				pNode: target
			} );
			if ( target ) {
				target.appendChild( this.fragment.docFrag );
			}
			// If this is *isn't* a child of a component that's in the process of rendering,
			// it should call any `init()` methods at this point
			if ( !this._parent || !this._parent._rendering ) {
				initChildren( this );
			}
			delete this._rendering;
			runloop.end();
		};

		function initChildren( instance ) {
			var child;
			while ( child = instance._childInitQueue.pop() ) {
				if ( child.instance.init ) {
					child.instance.init( child.options );
				}
				// now do the same for grandchildren, etc
				initChildren( child.instance );
			}
		}
	}( global_runloop, global_css, render_DomFragment__DomFragment );

	var Ractive_prototype_renderHTML = function( warn ) {

		return function() {
			// TODO remove this method in a future version!
			warn( 'renderHTML() has been deprecated and will be removed in a future version. Please use toHTML() instead' );
			return this.toHTML();
		};
	}( utils_warn );

	var Ractive_prototype_reset = function( Promise, runloop, clearCache, notifyDependants ) {

		return function( data, callback ) {
			var promise, fulfilPromise, wrapper;
			if ( typeof data === 'function' ) {
				callback = data;
				data = {};
			} else {
				data = data || {};
			}
			if ( typeof data !== 'object' ) {
				throw new Error( 'The reset method takes either no arguments, or an object containing new data' );
			}
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			if ( callback ) {
				promise.then( callback );
			}
			runloop.start( this, fulfilPromise );
			// If the root object is wrapped, try and use the wrapper's reset value
			if ( ( wrapper = this._wrapped[ '' ] ) && wrapper.reset ) {
				if ( wrapper.reset( data ) === false ) {
					// reset was rejected, we need to replace the object
					this.data = data;
				}
			} else {
				this.data = data;
			}
			clearCache( this, '' );
			notifyDependants( this, '' );
			runloop.end();
			this.fire( 'reset', data );
			return promise;
		};
	}( utils_Promise, global_runloop, shared_clearCache, shared_notifyDependants );

	var Ractive_prototype_set = function( runloop, isObject, normaliseKeypath, Promise, set ) {

		return function Ractive_prototype_set( keypath, value, callback ) {
			var map, promise, fulfilPromise;
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			runloop.start( this, fulfilPromise );
			// Set multiple keypaths in one go
			if ( isObject( keypath ) ) {
				map = keypath;
				callback = value;
				for ( keypath in map ) {
					if ( map.hasOwnProperty( keypath ) ) {
						value = map[ keypath ];
						keypath = normaliseKeypath( keypath );
						set( this, keypath, value );
					}
				}
			} else {
				keypath = normaliseKeypath( keypath );
				set( this, keypath, value );
			}
			runloop.end();
			if ( callback ) {
				promise.then( callback.bind( this ) );
			}
			return promise;
		};
	}( global_runloop, utils_isObject, utils_normaliseKeypath, utils_Promise, shared_set );

	var Ractive_prototype_subtract = function( add ) {

		return function( keypath, d ) {
			return add( this, keypath, d === undefined ? -1 : -d );
		};
	}( Ractive_prototype_shared_add );

	// Teardown. This goes through the root fragment and all its children, removing observers
	// and generally cleaning up after itself
	var Ractive_prototype_teardown = function( types, css, runloop, Promise, clearCache ) {

		return function( callback ) {
			var keypath, promise, fulfilPromise, shouldDestroy, originalCallback, fragment, nearestDetachingElement, unresolvedImplicitDependency;
			this.fire( 'teardown' );
			// If this is a component, and the component isn't marked for destruction,
			// don't detach nodes from the DOM unnecessarily
			shouldDestroy = !this.component || this.component.shouldDestroy;
			if ( this.constructor.css ) {
				// We need to find the nearest detaching element. When it gets removed
				// from the DOM, it's safe to remove our CSS
				if ( shouldDestroy ) {
					originalCallback = callback;
					callback = function() {
						if ( originalCallback ) {
							originalCallback.call( this );
						}
						css.remove( this.constructor );
					};
				} else {
					fragment = this.component.parentFragment;
					do {
						if ( fragment.owner.type !== types.ELEMENT ) {
							continue;
						}
						if ( fragment.owner.willDetach ) {
							nearestDetachingElement = fragment.owner;
						}
					} while ( !nearestDetachingElement && ( fragment = fragment.parent ) );
					if ( !nearestDetachingElement ) {
						throw new Error( 'A component is being torn down but doesn\'t have a nearest detaching element... this shouldn\'t happen!' );
					}
					nearestDetachingElement.cssDetachQueue.push( this.constructor );
				}
			}
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			runloop.start( this, fulfilPromise );
			this.fragment.teardown( shouldDestroy );
			// Cancel any animations in progress
			while ( this._animations[ 0 ] ) {
				this._animations[ 0 ].stop();
			}
			// Clear cache - this has the side-effect of unregistering keypaths from modified arrays.
			for ( keypath in this._cache ) {
				clearCache( this, keypath );
			}
			// Teardown any failed lookups - we don't need them to resolve any more
			while ( unresolvedImplicitDependency = this._unresolvedImplicitDependencies.pop() ) {
				unresolvedImplicitDependency.teardown();
			}
			runloop.end();
			if ( callback ) {
				promise.then( callback.bind( this ) );
			}
			return promise;
		};
	}( config_types, global_css, global_runloop, utils_Promise, shared_clearCache );

	var Ractive_prototype_toHTML = function() {
		return this.fragment.toString();
	};

	var Ractive_prototype_toggle = function( keypath, callback ) {
		var value;
		if ( typeof keypath !== 'string' ) {
			if ( this.debug ) {
				throw new Error( 'Bad arguments' );
			}
			return;
		}
		value = this.get( keypath );
		return this.set( keypath, !value, callback );
	};

	var Ractive_prototype_update = function( runloop, Promise, clearCache, notifyDependants ) {

		return function( keypath, callback ) {
			var promise, fulfilPromise;
			if ( typeof keypath === 'function' ) {
				callback = keypath;
				keypath = '';
			} else {
				keypath = keypath || '';
			}
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			runloop.start( this, fulfilPromise );
			clearCache( this, keypath );
			notifyDependants( this, keypath );
			runloop.end();
			this.fire( 'update', keypath );
			if ( callback ) {
				promise.then( callback.bind( this ) );
			}
			return promise;
		};
	}( global_runloop, utils_Promise, shared_clearCache, shared_notifyDependants );

	var Ractive_prototype_updateModel = function( getValueFromCheckboxes, arrayContentsMatch, isEqual ) {

		return function Ractive_prototype_updateModel( keypath, cascade ) {
			var values, deferredCheckboxes, i;
			if ( typeof keypath !== 'string' ) {
				keypath = '';
				cascade = true;
			}
			consolidateChangedValues( this, keypath, values = {}, deferredCheckboxes = [], cascade );
			if ( i = deferredCheckboxes.length ) {
				while ( i-- ) {
					keypath = deferredCheckboxes[ i ];
					values[ keypath ] = getValueFromCheckboxes( this, keypath );
				}
			}
			this.set( values );
		};

		function consolidateChangedValues( ractive, keypath, values, deferredCheckboxes, cascade ) {
			var bindings, childDeps, i, binding, oldValue, newValue;
			bindings = ractive._twowayBindings[ keypath ];
			if ( bindings ) {
				i = bindings.length;
				while ( i-- ) {
					binding = bindings[ i ];
					// special case - radio name bindings
					if ( binding.radioName && !binding.node.checked ) {
						continue;
					}
					// special case - checkbox name bindings
					if ( binding.checkboxName ) {
						if ( binding.changed() && deferredCheckboxes[ keypath ] !== true ) {
							// we will need to see which checkboxes with the same name are checked,
							// but we only want to do so once
							deferredCheckboxes[ keypath ] = true;
							// for quick lookup without indexOf
							deferredCheckboxes.push( keypath );
						}
						continue;
					}
					oldValue = binding.attr.value;
					newValue = binding.value();
					if ( arrayContentsMatch( oldValue, newValue ) ) {
						continue;
					}
					if ( !isEqual( oldValue, newValue ) ) {
						values[ keypath ] = newValue;
					}
				}
			}
			if ( !cascade ) {
				return;
			}
			// cascade
			childDeps = ractive._depsMap[ keypath ];
			if ( childDeps ) {
				i = childDeps.length;
				while ( i-- ) {
					consolidateChangedValues( ractive, childDeps[ i ], values, deferredCheckboxes, cascade );
				}
			}
		}
	}( shared_getValueFromCheckboxes, utils_arrayContentsMatch, utils_isEqual );

	var Ractive_prototype__prototype = function( add, animate, detach, find, findAll, findAllComponents, findComponent, fire, get, insert, merge, observe, off, on, render, renderHTML, reset, set, subtract, teardown, toHTML, toggle, update, updateModel ) {

		return {
			add: add,
			animate: animate,
			detach: detach,
			find: find,
			findAll: findAll,
			findAllComponents: findAllComponents,
			findComponent: findComponent,
			fire: fire,
			get: get,
			insert: insert,
			merge: merge,
			observe: observe,
			off: off,
			on: on,
			render: render,
			renderHTML: renderHTML,
			reset: reset,
			set: set,
			subtract: subtract,
			teardown: teardown,
			toHTML: toHTML,
			toggle: toggle,
			update: update,
			updateModel: updateModel
		};
	}( Ractive_prototype_add, Ractive_prototype_animate__animate, Ractive_prototype_detach, Ractive_prototype_find, Ractive_prototype_findAll, Ractive_prototype_findAllComponents, Ractive_prototype_findComponent, Ractive_prototype_fire, Ractive_prototype_get, Ractive_prototype_insert, Ractive_prototype_merge__merge, Ractive_prototype_observe__observe, Ractive_prototype_off, Ractive_prototype_on, Ractive_prototype_render, Ractive_prototype_renderHTML, Ractive_prototype_reset, Ractive_prototype_set, Ractive_prototype_subtract, Ractive_prototype_teardown, Ractive_prototype_toHTML, Ractive_prototype_toggle, Ractive_prototype_update, Ractive_prototype_updateModel );

	var registries_components = {};

	// These are a subset of the easing equations found at
	// https://raw.github.com/danro/easing-js - license info
	// follows:
	// --------------------------------------------------
	// easing.js v0.5.4
	// Generic set of easing functions with AMD support
	// https://github.com/danro/easing-js
	// This code may be freely distributed under the MIT license
	// http://danro.mit-license.org/
	// --------------------------------------------------
	// All functions adapted from Thomas Fuchs & Jeremy Kahn
	// Easing Equations (c) 2003 Robert Penner, BSD license
	// https://raw.github.com/danro/easing-js/master/LICENSE
	// --------------------------------------------------
	// In that library, the functions named easeIn, easeOut, and
	// easeInOut below are named easeInCubic, easeOutCubic, and
	// (you guessed it) easeInOutCubic.
	//
	// You can add additional easing functions to this list, and they
	// will be globally available.
	var registries_easing = {
		linear: function( pos ) {
			return pos;
		},
		easeIn: function( pos ) {
			return Math.pow( pos, 3 );
		},
		easeOut: function( pos ) {
			return Math.pow( pos - 1, 3 ) + 1;
		},
		easeInOut: function( pos ) {
			if ( ( pos /= 0.5 ) < 1 ) {
				return 0.5 * Math.pow( pos, 3 );
			}
			return 0.5 * ( Math.pow( pos - 2, 3 ) + 2 );
		}
	};

	var utils_getGuid = function() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, function( c ) {
			var r, v;
			r = Math.random() * 16 | 0;
			v = c == 'x' ? r : r & 3 | 8;
			return v.toString( 16 );
		} );
	};

	var utils_extend = function( target ) {
		var prop, source, sources = Array.prototype.slice.call( arguments, 1 );
		while ( source = sources.shift() ) {
			for ( prop in source ) {
				if ( source.hasOwnProperty( prop ) ) {
					target[ prop ] = source[ prop ];
				}
			}
		}
		return target;
	};

	var config_registries = [
		'adaptors',
		'components',
		'decorators',
		'easing',
		'events',
		'interpolators',
		'partials',
		'transitions',
		'data'
	];

	var extend_utils_transformCss = function() {

		var selectorsPattern = /(?:^|\})?\s*([^\{\}]+)\s*\{/g,
			commentsPattern = /\/\*.*?\*\//g,
			selectorUnitPattern = /((?:(?:\[[^\]+]\])|(?:[^\s\+\>\~:]))+)((?::[^\s\+\>\~]+)?\s*[\s\+\>\~]?)\s*/g;
		return function transformCss( css, guid ) {
			var transformed, addGuid;
			addGuid = function( selector ) {
				var selectorUnits, match, unit, dataAttr, base, prepended, appended, i, transformed = [];
				selectorUnits = [];
				while ( match = selectorUnitPattern.exec( selector ) ) {
					selectorUnits.push( {
						str: match[ 0 ],
						base: match[ 1 ],
						modifiers: match[ 2 ]
					} );
				}
				// For each simple selector within the selector, we need to create a version
				// that a) combines with the guid, and b) is inside the guid
				dataAttr = '[data-rvcguid="' + guid + '"]';
				base = selectorUnits.map( extractString );
				i = selectorUnits.length;
				while ( i-- ) {
					appended = base.slice();
					// Pseudo-selectors should go after the attribute selector
					unit = selectorUnits[ i ];
					appended[ i ] = unit.base + dataAttr + unit.modifiers || '';
					prepended = base.slice();
					prepended[ i ] = dataAttr + ' ' + prepended[ i ];
					transformed.push( appended.join( ' ' ), prepended.join( ' ' ) );
				}
				return transformed.join( ', ' );
			};
			transformed = css.replace( commentsPattern, '' ).replace( selectorsPattern, function( match, $1 ) {
				var selectors, transformed;
				selectors = $1.split( ',' ).map( trim );
				transformed = selectors.map( addGuid ).join( ', ' ) + ' ';
				return match.replace( $1, transformed );
			} );
			return transformed;
		};

		function trim( str ) {
			if ( str.trim ) {
				return str.trim();
			}
			return str.replace( /^\s+/, '' ).replace( /\s+$/, '' );
		}

		function extractString( unit ) {
			return unit.str;
		}
	}();

	var extend_inheritFromParent = function( registries, create, defineProperty, transformCss ) {

		// This is where we inherit class-level options, such as `modifyArrays`
		// or `append` or `twoway`, and registries such as `partials`
		return function( Child, Parent ) {
			registries.forEach( function( property ) {
				if ( Parent[ property ] ) {
					Child[ property ] = create( Parent[ property ] );
				}
			} );
			defineProperty( Child, 'defaults', {
				value: create( Parent.defaults )
			} );
			// Special case - CSS
			if ( Parent.css ) {
				defineProperty( Child, 'css', {
					value: Parent.defaults.noCssTransform ? Parent.css : transformCss( Parent.css, Child._guid )
				} );
			}
		};
	}( config_registries, utils_create, utils_defineProperty, extend_utils_transformCss );

	var extend_wrapMethod = function( method, superMethod ) {
		if ( /_super/.test( method ) ) {
			return function() {
				var _super = this._super,
					result;
				this._super = superMethod;
				result = method.apply( this, arguments );
				this._super = _super;
				return result;
			};
		} else {
			return method;
		}
	};

	var extend_utils_augment = function( target, source ) {
		var key;
		for ( key in source ) {
			if ( source.hasOwnProperty( key ) ) {
				target[ key ] = source[ key ];
			}
		}
		return target;
	};

	var extend_inheritFromChildProps = function( initOptions, registries, defineProperty, wrapMethod, augment, transformCss ) {

		var blacklisted = {};
		registries.concat( initOptions.keys ).forEach( function( property ) {
			blacklisted[ property ] = true;
		} );
		// This is where we augment the class-level options (inherited from
		// Parent) with the values passed to Parent.extend()
		return function( Child, childProps ) {
			var key, member;
			registries.forEach( function( property ) {
				var value = childProps[ property ];
				if ( value ) {
					if ( Child[ property ] ) {
						augment( Child[ property ], value );
					} else {
						Child[ property ] = value;
					}
				}
			} );
			initOptions.keys.forEach( function( key ) {
				var value = childProps[ key ];
				if ( value !== undefined ) {
					// we may need to wrap a function (e.g. the `complete` option)
					if ( typeof value === 'function' && typeof Child[ key ] === 'function' ) {
						Child.defaults[ key ] = wrapMethod( value, Child[ key ] );
					} else {
						Child.defaults[ key ] = childProps[ key ];
					}
				}
			} );
			for ( key in childProps ) {
				if ( !blacklisted[ key ] && childProps.hasOwnProperty( key ) ) {
					member = childProps[ key ];
					// if this is a method that overwrites a prototype method, we may need
					// to wrap it
					if ( typeof member === 'function' && typeof Child.prototype[ key ] === 'function' ) {
						Child.prototype[ key ] = wrapMethod( member, Child.prototype[ key ] );
					} else {
						Child.prototype[ key ] = member;
					}
				}
			}
			// Special case - CSS
			if ( childProps.css ) {
				defineProperty( Child, 'css', {
					value: Child.defaults.noCssTransform ? childProps.css : transformCss( childProps.css, Child._guid )
				} );
			}
		};
	}( config_initOptions, config_registries, utils_defineProperty, extend_wrapMethod, extend_utils_augment, extend_utils_transformCss );

	var extend_extractInlinePartials = function( isObject, augment ) {

		return function( Child, childProps ) {
			// does our template contain inline partials?
			if ( isObject( Child.defaults.template ) ) {
				if ( !Child.partials ) {
					Child.partials = {};
				}
				// get those inline partials
				augment( Child.partials, Child.defaults.template.partials );
				// but we also need to ensure that any explicit partials override inline ones
				if ( childProps.partials ) {
					augment( Child.partials, childProps.partials );
				}
				// move template to where it belongs
				Child.defaults.template = Child.defaults.template.main;
			}
		};
	}( utils_isObject, extend_utils_augment );

	var extend_conditionallyParseTemplate = function( errors, isClient, parse ) {

		return function( Child ) {
			var templateEl;
			if ( typeof Child.defaults.template === 'string' ) {
				if ( !parse ) {
					throw new Error( errors.missingParser );
				}
				if ( Child.defaults.template.charAt( 0 ) === '#' && isClient ) {
					templateEl = document.getElementById( Child.defaults.template.substring( 1 ) );
					if ( templateEl && templateEl.tagName === 'SCRIPT' ) {
						Child.defaults.template = parse( templateEl.innerHTML, Child );
					} else {
						throw new Error( 'Could not find template element (' + Child.defaults.template + ')' );
					}
				} else {
					Child.defaults.template = parse( Child.defaults.template, Child.defaults );
				}
			}
		};
	}( config_errors, config_isClient, parse__parse );

	var extend_conditionallyParsePartials = function( errors, parse ) {

		return function( Child ) {
			var key;
			// Parse partials, if necessary
			if ( Child.partials ) {
				for ( key in Child.partials ) {
					if ( Child.partials.hasOwnProperty( key ) && typeof Child.partials[ key ] === 'string' ) {
						if ( !parse ) {
							throw new Error( errors.missingParser );
						}
						Child.partials[ key ] = parse( Child.partials[ key ], Child );
					}
				}
			}
		};
	}( config_errors, parse__parse );

	var Ractive_initialise_computations_getComputationSignature = function() {

		var pattern = /\$\{([^\}]+)\}/g;
		return function( signature ) {
			if ( typeof signature === 'function' ) {
				return {
					get: signature
				};
			}
			if ( typeof signature === 'string' ) {
				return {
					get: createFunctionFromString( signature )
				};
			}
			if ( typeof signature === 'object' && typeof signature.get === 'string' ) {
				signature = {
					get: createFunctionFromString( signature.get ),
					set: signature.set
				};
			}
			return signature;
		};

		function createFunctionFromString( signature ) {
			var functionBody = 'var __ractive=this;return(' + signature.replace( pattern, function( match, keypath ) {
				return '__ractive.get("' + keypath + '")';
			} ) + ')';
			return new Function( functionBody );
		}
	}();

	var Ractive_initialise_computations_Watcher = function( isEqual, registerDependant, unregisterDependant ) {

		var Watcher = function( computation, keypath ) {
			this.root = computation.ractive;
			this.keypath = keypath;
			this.priority = 0;
			this.computation = computation;
			registerDependant( this );
		};
		Watcher.prototype = {
			update: function() {
				var value;
				value = this.root.get( this.keypath );
				if ( !isEqual( value, this.value ) ) {
					this.computation.bubble();
				}
			},
			teardown: function() {
				unregisterDependant( this );
			}
		};
		return Watcher;
	}( utils_isEqual, shared_registerDependant, shared_unregisterDependant );

	var Ractive_initialise_computations_Computation = function( warn, runloop, set, Watcher ) {

		var Computation = function( ractive, key, signature ) {
			this.ractive = ractive;
			this.key = key;
			this.getter = signature.get;
			this.setter = signature.set;
			this.watchers = [];
			this.update();
		};
		Computation.prototype = {
			set: function( value ) {
				if ( this.setting ) {
					this.value = value;
					return;
				}
				if ( !this.setter ) {
					throw new Error( 'Computed properties without setters are read-only in the current version' );
				}
				this.setter.call( this.ractive, value );
			},
			update: function() {
				var ractive, originalCaptured, result, errored;
				ractive = this.ractive;
				originalCaptured = ractive._captured;
				if ( !originalCaptured ) {
					ractive._captured = [];
				}
				try {
					result = this.getter.call( ractive );
				} catch ( err ) {
					if ( ractive.debug ) {
						warn( 'Failed to compute "' + this.key + '": ' + err.message || err );
					}
					errored = true;
				}
				diff( this, this.watchers, ractive._captured );
				// reset
				ractive._captured = originalCaptured;
				if ( !errored ) {
					this.setting = true;
					this.value = result;
					set( ractive, this.key, result );
					this.setting = false;
				}
				this.deferred = false;
			},
			bubble: function() {
				if ( this.watchers.length <= 1 ) {
					this.update();
				} else if ( !this.deferred ) {
					runloop.addComputation( this );
					this.deferred = true;
				}
			}
		};

		function diff( computation, watchers, newDependencies ) {
			var i, watcher, keypath;
			// remove dependencies that are no longer used
			i = watchers.length;
			while ( i-- ) {
				watcher = watchers[ i ];
				if ( !newDependencies[ watcher.keypath ] ) {
					watchers.splice( i, 1 );
					watchers[ watcher.keypath ] = null;
					watcher.teardown();
				}
			}
			// create references for any new dependencies
			i = newDependencies.length;
			while ( i-- ) {
				keypath = newDependencies[ i ];
				if ( !watchers[ keypath ] ) {
					watcher = new Watcher( computation, keypath );
					watchers.push( watchers[ keypath ] = watcher );
				}
			}
		}
		return Computation;
	}( utils_warn, global_runloop, shared_set, Ractive_initialise_computations_Watcher );

	var Ractive_initialise_computations_createComputations = function( getComputationSignature, Computation ) {

		return function createComputations( ractive, computed ) {
			var key, signature;
			for ( key in computed ) {
				signature = getComputationSignature( computed[ key ] );
				ractive._computations[ key ] = new Computation( ractive, key, signature );
			}
		};
	}( Ractive_initialise_computations_getComputationSignature, Ractive_initialise_computations_Computation );

	var Ractive_initialise = function( isClient, errors, initOptions, registries, warn, create, extend, fillGaps, defineProperties, getElement, isObject, isArray, getGuid, Promise, magicAdaptor, parse, createComputations ) {

		var flags = [
			'adapt',
			'modifyArrays',
			'magic',
			'twoway',
			'lazy',
			'debug',
			'isolated'
		];
		return function initialiseRactiveInstance( ractive, options ) {
			var defaults, template, templateEl, parsedTemplate, promise, fulfilPromise, computed;
			if ( isArray( options.adaptors ) ) {
				warn( 'The `adaptors` option, to indicate which adaptors should be used with a given Ractive instance, has been deprecated in favour of `adapt`. See [TODO] for more information' );
				options.adapt = options.adaptors;
				delete options.adaptors;
			}
			// Options
			// -------
			defaults = ractive.constructor.defaults;
			initOptions.keys.forEach( function( key ) {
				if ( options[ key ] === undefined ) {
					options[ key ] = defaults[ key ];
				}
			} );
			// options
			flags.forEach( function( flag ) {
				ractive[ flag ] = options[ flag ];
			} );
			// special cases
			if ( typeof ractive.adapt === 'string' ) {
				ractive.adapt = [ ractive.adapt ];
			}
			if ( ractive.magic && !magicAdaptor ) {
				throw new Error( 'Getters and setters (magic mode) are not supported in this browser' );
			}
			// Initialisation
			// --------------
			// We use Object.defineProperties (where possible) as these should be read-only
			defineProperties( ractive, {
				_initing: {
					value: true,
					writable: true
				},
				// Generate a unique identifier, for places where you'd use a weak map if it
				// existed
				_guid: {
					value: getGuid()
				},
				// events
				_subs: {
					value: create( null ),
					configurable: true
				},
				// cache
				_cache: {
					value: {}
				},
				// we need to be able to use hasOwnProperty, so can't inherit from null
				_cacheMap: {
					value: create( null )
				},
				// dependency graph
				_deps: {
					value: []
				},
				_depsMap: {
					value: create( null )
				},
				_patternObservers: {
					value: []
				},
				// Keep a list of used evaluators, so we don't duplicate them
				_evaluators: {
					value: create( null )
				},
				// Computed properties
				_computations: {
					value: create( null )
				},
				// two-way bindings
				_twowayBindings: {
					value: {}
				},
				// animations (so we can stop any in progress at teardown)
				_animations: {
					value: []
				},
				// nodes registry
				nodes: {
					value: {}
				},
				// property wrappers
				_wrapped: {
					value: create( null )
				},
				// live queries
				_liveQueries: {
					value: []
				},
				_liveComponentQueries: {
					value: []
				},
				// components to init at the end of a mutation
				_childInitQueue: {
					value: []
				},
				// data changes
				_changes: {
					value: []
				},
				// failed lookups, when we try to access data from ancestor scopes
				_unresolvedImplicitDependencies: {
					value: []
				}
			} );
			// If this is a component, store a reference to the parent
			if ( options._parent && options._component ) {
				defineProperties( ractive, {
					_parent: {
						value: options._parent
					},
					component: {
						value: options._component
					}
				} );
				// And store a reference to the instance on the component
				options._component.instance = ractive;
			}
			if ( options.el ) {
				ractive.el = getElement( options.el );
				if ( !ractive.el && ractive.debug ) {
					throw new Error( 'Could not find container element' );
				}
			}
			// Create local registry objects, with the global registries as prototypes
			if ( options.eventDefinitions ) {
				// TODO remove support
				warn( 'ractive.eventDefinitions has been deprecated in favour of ractive.events. Support will be removed in future versions' );
				options.events = options.eventDefinitions;
			}
			registries.forEach( function( registry ) {
				if ( ractive.constructor[ registry ] ) {
					ractive[ registry ] = extend( create( ractive.constructor[ registry ] ), options[ registry ] );
				} else if ( options[ registry ] ) {
					ractive[ registry ] = options[ registry ];
				}
			} );
			// Special case
			if ( !ractive.data ) {
				ractive.data = {};
			}
			// Set up any computed values
			computed = defaults.computed ? extend( create( defaults.computed ), options.computed ) : options.computed;
			if ( computed ) {
				createComputations( ractive, computed );
			}
			// Parse template, if necessary
			template = options.template;
			if ( typeof template === 'string' ) {
				if ( !parse ) {
					throw new Error( errors.missingParser );
				}
				if ( template.charAt( 0 ) === '#' && isClient ) {
					// assume this is an ID of a <script type='text/ractive'> tag
					templateEl = document.getElementById( template.substring( 1 ) );
					if ( templateEl ) {
						parsedTemplate = parse( templateEl.innerHTML, options );
					} else {
						throw new Error( 'Could not find template element (' + template + ')' );
					}
				} else {
					parsedTemplate = parse( template, options );
				}
			} else {
				parsedTemplate = template;
			}
			// deal with compound template
			if ( isObject( parsedTemplate ) ) {
				fillGaps( ractive.partials, parsedTemplate.partials );
				parsedTemplate = parsedTemplate.main;
			}
			// If the template was an array with a single string member, that means
			// we can use innerHTML - we just need to unpack it
			if ( parsedTemplate && parsedTemplate.length === 1 && typeof parsedTemplate[ 0 ] === 'string' ) {
				parsedTemplate = parsedTemplate[ 0 ];
			}
			ractive.template = parsedTemplate;
			// Add partials to our registry
			extend( ractive.partials, options.partials );
			ractive.parseOptions = {
				preserveWhitespace: options.preserveWhitespace,
				sanitize: options.sanitize,
				stripComments: options.stripComments
			};
			// Temporarily disable transitions, if noIntro flag is set
			ractive.transitionsEnabled = options.noIntro ? false : options.transitionsEnabled;
			// If we're in a browser, and no element has been specified, create
			// a document fragment to use instead
			if ( isClient && !ractive.el ) {
				ractive.el = document.createDocumentFragment();
			}
			// If the target contains content, and `append` is falsy, clear it
			if ( ractive.el && !options.append ) {
				ractive.el.innerHTML = '';
			}
			promise = new Promise( function( fulfil ) {
				fulfilPromise = fulfil;
			} );
			ractive.render( ractive.el, fulfilPromise );
			if ( options.complete ) {
				promise.then( options.complete.bind( ractive ) );
			}
			// reset transitionsEnabled
			ractive.transitionsEnabled = options.transitionsEnabled;
			// end init sequence
			ractive._initing = false;
		};
	}( config_isClient, config_errors, config_initOptions, config_registries, utils_warn, utils_create, utils_extend, utils_fillGaps, utils_defineProperties, utils_getElement, utils_isObject, utils_isArray, utils_getGuid, utils_Promise, shared_get_magicAdaptor, parse__parse, Ractive_initialise_computations_createComputations );

	var extend_initChildInstance = function( initOptions, wrapMethod, initialise ) {

		// The Child constructor contains the default init options for this class
		return function initChildInstance( child, Child, options ) {
			initOptions.keys.forEach( function( key ) {
				var value = options[ key ],
					defaultValue = Child.defaults[ key ];
				if ( typeof value === 'function' && typeof defaultValue === 'function' ) {
					options[ key ] = wrapMethod( value, defaultValue );
				}
			} );
			if ( child.beforeInit ) {
				child.beforeInit( options );
			}
			initialise( child, options );
			// If this is an inline component (i.e. NOT created with `var widget = new Widget()`,
			// but rather `<widget/>` or similar), we don't want to call the `init` method until
			// the component is in the DOM. That makes it easier for component authors to do stuff
			// like `this.width = this.find('*').clientWidth` or whatever without using
			// ugly setTimeout hacks.
			if ( options._parent && options._parent._rendering ) {
				options._parent._childInitQueue.push( {
					instance: child,
					options: options
				} );
			} else if ( child.init ) {
				child.init( options );
			}
		};
	}( config_initOptions, extend_wrapMethod, Ractive_initialise );

	var extend__extend = function( create, defineProperties, getGuid, extendObject, inheritFromParent, inheritFromChildProps, extractInlinePartials, conditionallyParseTemplate, conditionallyParsePartials, initChildInstance, circular ) {

		var Ractive;
		circular.push( function() {
			Ractive = circular.Ractive;
		} );
		return function extend( childProps ) {
			var Parent = this,
				Child, adaptor, i;
			// if we're extending with another Ractive instance, inherit its
			// prototype methods and default options as well
			if ( childProps.prototype instanceof Ractive ) {
				childProps = extendObject( {}, childProps, childProps.prototype, childProps.defaults );
			}
			// create Child constructor
			Child = function( options ) {
				initChildInstance( this, Child, options || {} );
			};
			Child.prototype = create( Parent.prototype );
			Child.prototype.constructor = Child;
			defineProperties( Child, {
				extend: {
					value: Parent.extend
				},
				// each component needs a guid, for managing CSS etc
				_guid: {
					value: getGuid()
				}
			} );
			// Inherit options from parent
			inheritFromParent( Child, Parent );
			// Add new prototype methods and init options
			inheritFromChildProps( Child, childProps );
			// Special case - adaptors. Convert to function if possible
			if ( Child.adaptors && ( i = Child.defaults.adapt.length ) ) {
				while ( i-- ) {
					adaptor = Child.defaults.adapt[ i ];
					if ( typeof adaptor === 'string' ) {
						Child.defaults.adapt[ i ] = Child.adaptors[ adaptor ] || adaptor;
					}
				}
			}
			// Parse template and any partials that need it
			if ( childProps.template ) {
				// ignore inherited templates!
				conditionallyParseTemplate( Child );
				extractInlinePartials( Child, childProps );
				conditionallyParsePartials( Child );
			}
			return Child;
		};
	}( utils_create, utils_defineProperties, utils_getGuid, utils_extend, extend_inheritFromParent, extend_inheritFromChildProps, extend_extractInlinePartials, extend_conditionallyParseTemplate, extend_conditionallyParsePartials, extend_initChildInstance, circular );

	var Ractive__Ractive = function( initOptions, svg, defineProperties, proto, partialRegistry, adaptorRegistry, componentsRegistry, easingRegistry, interpolatorsRegistry, Promise, extend, parse, initialise, circular ) {

		var Ractive = function( options ) {
			initialise( this, options );
		};
		Ractive.prototype = proto;
		// Read-only properties
		defineProperties( Ractive, {
			// Shared properties
			partials: {
				value: partialRegistry
			},
			// Plugins
			adaptors: {
				value: adaptorRegistry
			},
			easing: {
				value: easingRegistry
			},
			transitions: {
				value: {}
			},
			events: {
				value: {}
			},
			components: {
				value: componentsRegistry
			},
			decorators: {
				value: {}
			},
			interpolators: {
				value: interpolatorsRegistry
			},
			// Default options
			defaults: {
				value: initOptions.defaults
			},
			// Support
			svg: {
				value: svg
			},
			VERSION: {
				value: '0.4.0'
			}
		} );
		// TODO deprecated
		Ractive.eventDefinitions = Ractive.events;
		Ractive.prototype.constructor = Ractive;
		// Namespaced constructors
		Ractive.Promise = Promise;
		// Static methods
		Ractive.extend = extend;
		Ractive.parse = parse;
		circular.Ractive = Ractive;
		return Ractive;
	}( config_initOptions, config_svg, utils_defineProperties, Ractive_prototype__prototype, registries_partials, registries_adaptors, registries_components, registries_easing, registries_interpolators, utils_Promise, extend__extend, parse__parse, Ractive_initialise, circular );

	var Ractive = function( Ractive, circular ) {

		var FUNCTION = 'function';
		// Certain modules have circular dependencies. If we were bundling a
		// module loader, e.g. almond.js, this wouldn't be a problem, but we're
		// not - we're using amdclean as part of the build process. Because of
		// this, we need to wait until all modules have loaded before those
		// circular dependencies can be required.
		while ( circular.length ) {
			circular.pop()();
		}
		// Ractive.js makes liberal use of things like Array.prototype.indexOf. In
		// older browsers, these are made available via a shim - here, we do a quick
		// pre-flight check to make sure that either a) we're not in a shit browser,
		// or b) we're using a Ractive-legacy.js build
		if ( typeof Date.now !== FUNCTION || typeof String.prototype.trim !== FUNCTION || typeof Object.keys !== FUNCTION || typeof Array.prototype.indexOf !== FUNCTION || typeof Array.prototype.forEach !== FUNCTION || typeof Array.prototype.map !== FUNCTION || typeof Array.prototype.filter !== FUNCTION || typeof window !== 'undefined' && typeof window.addEventListener !== FUNCTION ) {
			throw new Error( 'It looks like you\'re attempting to use Ractive.js in an older browser. You\'ll need to use one of the \'legacy builds\' in order to continue - see http://docs.ractivejs.org/latest/legacy-builds for more information.' );
		}
		// Internet Explorer derp. Methods that should be attached to Node.prototype
		// are instead attached to HTMLElement.prototype, which means SVG elements
		// can't use them. Remember kids, friends don't let friends use IE.
		//
		// This is here, rather than in legacy.js, because it affects IE9.
		if ( typeof window !== 'undefined' && window.Node && !window.Node.prototype.contains && window.HTMLElement && window.HTMLElement.prototype.contains ) {
			window.Node.prototype.contains = window.HTMLElement.prototype.contains;
		}
		return Ractive;
	}( Ractive__Ractive, circular, legacy );


	// export as Common JS module...
	if ( typeof module !== "undefined" && module.exports ) {
		module.exports = Ractive;
	}

	// ... or as AMD module
	else if ( typeof define === "function" && define.amd ) {
		define( 'ractive',[],function() {
			return Ractive;
		} );
	}

	// ... or as browser global
	global.Ractive = Ractive;

	Ractive.noConflict = function() {
		global.Ractive = noConflict;
		return Ractive;
	};

}( typeof window !== 'undefined' ? window : this ) );

/*

	Backbone adaptor plugin
	=======================

	Version . Copyright 2013 @rich_harris, MIT licensed.

	This plugin allows Ractive.js to work seamlessly with Backbone.Model and
	Backbone.Collection instances.

	For more information see ractivejs.org/examples/backbone and
	https://github.com/Rich-Harris/Ractive/wiki/Adaptors.

	==========================

	Troubleshooting: If you're using a module system in your app (AMD or
	something more nodey) then you may need to change the paths below,
	where it says `require( 'ractive' )` or `define([ 'ractive' ]...)`.

	==========================

	Usage: Include this file on your page below Ractive, e.g:

	    <script src='lib/ractive.js'></script>
	    <script src='lib/ractive-adaptors-backbone.js'></script>

	Or, if you're using a module loader, require this module:

	    define( function ( require ) {
	      var Ractive = require( 'ractive' );

	      // requiring the plugin will 'activate' it - no need to use
	      // the return value
	      require( 'ractive-adaptors-backbone' );
	    });

	Then tell Ractive to expect Backbone objects by adding an `adapt` property:

	    var ractive = new Ractive({
	      el: myContainer,
	      template: myTemplate,
	      data: { foo: myBackboneModel, bar: myBackboneCollection },
	      adapt: [ 'Backbone' ]
	    });

*/

(function ( global, factory ) {

	

	// Common JS (i.e. browserify) environment
	if ( typeof module !== 'undefined' && module.exports && typeof require === 'function' ) {
		factory( require( 'ractive' ), require( 'backbone' ) );
	}

	// AMD?
	else if ( typeof define === 'function' && define.amd ) {
		define('ractive-backbone',[ 'ractive', 'backbone' ], factory );
	}

	// browser global
	else if ( global.Ractive && global.Backbone ) {
		factory( global.Ractive, global.Backbone );
	}

	else {
		throw new Error( 'Could not find Ractive or Backbone! Both must be loaded before the ractive-adaptors-backbone plugin' );
	}

}( typeof window !== 'undefined' ? window : this, function ( Ractive, Backbone ) {

	

	var BackboneModelWrapper, BackboneCollectionWrapper;

	if ( !Ractive || !Backbone ) {
		throw new Error( 'Could not find Ractive or Backbone! Check your paths config' );
	}

	Ractive.adaptors.Backbone = {
		filter: function ( object ) {
			return object instanceof Backbone.Model || object instanceof Backbone.Collection;
		},
		wrap: function ( ractive, object, keypath, prefix ) {
			if ( object instanceof Backbone.Model ) {
				return new BackboneModelWrapper( ractive, object, keypath, prefix );
			}

			return new BackboneCollectionWrapper( ractive, object, keypath, prefix );
		}
	};

	BackboneModelWrapper = function ( ractive, model, keypath, prefix ) {
		var wrapper = this;

		this.value = model;

		model.on( 'change', this.modelChangeHandler = function () {
			wrapper.setting = true;
			ractive.set( prefix( model.changed ) );
			wrapper.setting = false;
		});
	};

	BackboneModelWrapper.prototype = {
		teardown: function () {
			this.value.off( 'change', this.modelChangeHandler );
		},
		get: function () {
			return this.value.attributes;
		},
		set: function ( keypath, value ) {
			// Only set if the model didn't originate the change itself, and
			// only if it's an immediate child property
			if ( !this.setting && keypath.indexOf( '.' ) === -1 ) {
				this.value.set( keypath, value );
			}
		},
		reset: function ( object ) {
			// If the new object is a Backbone model, assume this one is
			// being retired. Ditto if it's not a model at all
			if ( object instanceof Backbone.Model || !(object instanceof Object) ) {
				return false;
			}

			// Otherwise if this is a POJO, reset the model
			this.value.reset( object );
		}
	};

	BackboneCollectionWrapper = function ( ractive, collection, keypath ) {
		var wrapper = this;

		this.value = collection;

		collection.on( 'add remove reset sort', this.changeHandler = function () {
			// TODO smart merge. It should be possible, if awkward, to trigger smart
			// updates instead of a blunderbuss .set() approach
			wrapper.setting = true;
			ractive.set( keypath, collection.models );
			wrapper.setting = false;
		});
	};

	BackboneCollectionWrapper.prototype = {
		teardown: function () {
			this.value.off( 'add remove reset sort', this.changeHandler );
		},
		get: function () {
			return this.value.models;
		},
		reset: function ( models ) {
			if ( this.setting ) {
				return;
			}

			// If the new object is a Backbone collection, assume this one is
			// being retired. Ditto if it's not a collection at all
			if ( models instanceof Backbone.Collection || Object.prototype.toString.call( models ) !== '[object Array]' ) {
				return false;
			}

			// Otherwise if this is a plain array, reset the collection
			this.value.reset( models );
		}
	};

}));

/*

	ractive-events-tap
	==================

	Version 0.1.1.

	On mobile devices, using `on-click` isn't good enough. Tapping the
	touchscreen will fire a simulated click event, but only after a 300
	millisecond delay, which makes your app feel sluggish. It also
	causes the tapped area to highlight, which in most cases looks a
	bit messy.

	Instead, use `on-tap`. When you tap an area, the simulated click
	event will be prevented, and the user's action is responded to
	instantly. The `on-tap` event also differs from `on-click` in that
	the click event will (frankly rather bizarrely) fire even if you
	hold the mouse down over a single element for several seconds and
	waggle it about.

	Pointer events are also supported, as is pressing the spacebar when
	the relevant element is focused (which triggers a click event, and
	is good for accessibility).

	==========================

	Troubleshooting: If you're using a module system in your app (AMD or
	something more nodey) then you may need to change the paths below,
	where it says `require( 'ractive' )` or `define([ 'ractive' ]...)`.

	==========================

	Usage: Include this file on your page below Ractive, e.g:

	    <script src='lib/ractive.js'></script>
	    <script src='lib/ractive-events-tap.js'></script>

	Or, if you're using a module loader, require this module:

	    // requiring the plugin will 'activate' it - no need to use
	    // the return value
	    require( 'ractive-events-tap' );

	Add a tap event in the normal fashion:

	    <div on-tap='foo'>tap me!</div>

	Then add a handler:

	    ractive.on( 'foo', function ( event ) {
	      alert( 'tapped' );
	    });

*/

(function ( global, factory ) {

	

	// Common JS (i.e. browserify) environment
	if ( typeof module !== 'undefined' && module.exports && typeof require === 'function' ) {
		factory( require( 'ractive' ) );
	}

	// AMD?
	else if ( typeof define === 'function' && define.amd ) {
		define('ractive-events-tap',[ 'ractive' ], factory );
	}

	// browser global
	else if ( global.Ractive ) {
		factory( global.Ractive );
	}

	else {
		throw new Error( 'Could not find Ractive! It must be loaded before the ractive-events-tap plugin' );
	}

}( typeof window !== 'undefined' ? window : this, function ( Ractive ) {

	

	var tap = function ( node, fire ) {
		var mousedown, touchstart, focusHandler, distanceThreshold, timeThreshold;

		distanceThreshold = 5; // maximum pixels pointer can move before cancel
		timeThreshold = 400;   // maximum milliseconds between down and up before cancel

		mousedown = function ( event ) {
			var currentTarget, x, y, pointerId, up, move, cancel;

			if ( event.which !== undefined && event.which !== 1 ) {
				return;
			}

			x = event.clientX;
			y = event.clientY;
			currentTarget = this;
			// This will be null for mouse events.
			pointerId = event.pointerId;

			up = function ( event ) {
				if ( event.pointerId != pointerId ) {
					return;
				}

				fire({
					node: currentTarget,
					original: event
				});

				cancel();
			};

			move = function ( event ) {
				if ( event.pointerId != pointerId ) {
					return;
				}

				if ( ( Math.abs( event.clientX - x ) >= distanceThreshold ) || ( Math.abs( event.clientY - y ) >= distanceThreshold ) ) {
					cancel();
				}
			};

			cancel = function () {
				node.removeEventListener( 'MSPointerUp', up, false );
				document.removeEventListener( 'MSPointerMove', move, false );
				document.removeEventListener( 'MSPointerCancel', cancel, false );
				node.removeEventListener( 'pointerup', up, false );
				document.removeEventListener( 'pointermove', move, false );
				document.removeEventListener( 'pointercancel', cancel, false );
				node.removeEventListener( 'click', up, false );
				document.removeEventListener( 'mousemove', move, false );
			};

			if ( window.navigator.pointerEnabled ) {
				node.addEventListener( 'pointerup', up, false );
				document.addEventListener( 'pointermove', move, false );
				document.addEventListener( 'pointercancel', cancel, false );
			} else if ( window.navigator.msPointerEnabled ) {
				node.addEventListener( 'MSPointerUp', up, false );
				document.addEventListener( 'MSPointerMove', move, false );
				document.addEventListener( 'MSPointerCancel', cancel, false );
			} else {
				node.addEventListener( 'click', up, false );
				document.addEventListener( 'mousemove', move, false );
			}

			setTimeout( cancel, timeThreshold );
		};

		if ( window.navigator.pointerEnabled ) {
			node.addEventListener( 'pointerdown', mousedown, false );
		} else if ( window.navigator.msPointerEnabled ) {
			node.addEventListener( 'MSPointerDown', mousedown, false );
		} else {
			node.addEventListener( 'mousedown', mousedown, false );
		}


		touchstart = function ( event ) {
			var currentTarget, x, y, touch, finger, move, up, cancel;

			if ( event.touches.length !== 1 ) {
				return;
			}

			touch = event.touches[0];

			x = touch.clientX;
			y = touch.clientY;
			currentTarget = this;

			finger = touch.identifier;

			up = function ( event ) {
				var touch;

				touch = event.changedTouches[0];
				if ( touch.identifier !== finger ) {
					cancel();
				}

				event.preventDefault();  // prevent compatibility mouse event
				fire({
					node: currentTarget,
					original: event
				});

				cancel();
			};

			move = function ( event ) {
				var touch;

				if ( event.touches.length !== 1 || event.touches[0].identifier !== finger ) {
					cancel();
				}

				touch = event.touches[0];
				if ( ( Math.abs( touch.clientX - x ) >= distanceThreshold ) || ( Math.abs( touch.clientY - y ) >= distanceThreshold ) ) {
					cancel();
				}
			};

			cancel = function () {
				node.removeEventListener( 'touchend', up, false );
				window.removeEventListener( 'touchmove', move, false );
				window.removeEventListener( 'touchcancel', cancel, false );
			};

			node.addEventListener( 'touchend', up, false );
			window.addEventListener( 'touchmove', move, false );
			window.addEventListener( 'touchcancel', cancel, false );

			setTimeout( cancel, timeThreshold );
		};

		node.addEventListener( 'touchstart', touchstart, false );


		// native buttons, and <input type='button'> elements, should fire a tap event
		// when the space key is pressed
		if ( node.tagName === 'BUTTON' || node.type === 'button' ) {
			focusHandler = function () {
				var blurHandler, keydownHandler;

				keydownHandler = function ( event ) {
					if ( event.which === 32 ) { // space key
						fire({
							node: node,
							original: event
						});
					}
				};

				blurHandler = function () {
					node.removeEventListener( 'keydown', keydownHandler, false );
					node.removeEventListener( 'blur', blurHandler, false );
				};

				node.addEventListener( 'keydown', keydownHandler, false );
				node.addEventListener( 'blur', blurHandler, false );
			};

			node.addEventListener( 'focus', focusHandler, false );
		}


		return {
			teardown: function () {
				node.removeEventListener( 'pointerdown', mousedown, false );
				node.removeEventListener( 'MSPointerDown', mousedown, false );
				node.removeEventListener( 'mousedown', mousedown, false );
				node.removeEventListener( 'touchstart', touchstart, false );
				node.removeEventListener( 'focus', focusHandler, false );
			}
		};
	};

	Ractive.events.tap = tap;

}));

/**
 * @license RequireJS text 2.0.12 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.12',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config && config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config && config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                if (errback) {
                    errback(e);
                }
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status || 0;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        if (errback) {
                            errback(err);
                        }
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes;
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});


define('text!templates/application.mustache',[],function () { return '<div class="application-container">\n  <div class="message-container"></div>\n\n  <div class="content-container">\n\n    <div class="navigation horizontal top-container">\n      <div class="candidate-list">\n        {{#candidates}}\n          <div class="candidate {{#eliminated}}eliminated{{/eliminated}} inline-block">\n            <img class="rounded" src="{{ options.paths.images }}{{ candidateid }}.jpg">\n            <div class="candidate-name small">\n              {{#profileurl}}\n                <a href="{{ profileurl }}" target="_blank">{{ name }}</a>\n              {{/profileurl}}\n              {{^profileurl}}{{ name }}{{/profileurl}}\n            </div>\n          </div>\n        {{/candidates}}\n      </div>\n\n      <div class="one-left">\n        {{#(candidatesLeft.length === 1)}}\n          {{#candidatesLeft.0}}\n            It looks like <strong>{{ name }}</strong> is your best fit.\n              {{#profileurl}}\n                <a href="{{ profileurl }}" target="_blank">Learn more</a> about this candidate.\n              {{/profileurl}}\n              <a href="#" on-tap="clearQuestions" class="">Start over</a>.\n            {{/candidatesLeft.0}}\n        {{/()}}\n        {{#(typeof candidatesLeft.length != \'undefined\' && candidatesLeft.length === 0)}}\n          Somehow you filtered everyone out!  <a href="#" on-tap="clearQuestions" class="">Start over</a>.\n        {{/()}}\n      </div>\n    </div>\n\n    <div class="spacer"></div>\n\n    <div class="category-list hide">\n      {{#categories}}\n        <button class="button xsmall category">\n          {{ category }}\n        </button>\n      {{/categories}}\n    </div>\n\n    <p class="instructions caption">Answer the questions below to filter out candidates.  If a question goes dim, then that means answering it or changing that answer would not help filter more candidates, or it would lead to all candidates being filtered out.  If you want to start over, use this link to <a href="#" on-tap="clearQuestions" class="">clear all the answers</a>.</p>\n\n\n    <div class="question-list">\n      {{#questions}}\n        <div class="question {{ state }}">\n          <div class="question-text large">{{ question }}</div>\n\n          <div class="question-options">\n            <button\n              on-tap="answer:[\'Y\', {{ questionid }}]"\n              class="button small\n                {{#(answer !== \'Y\')}}info{{/()}}\n                {{#(answer === \'Y\')}}active primary{{/()}}"\n            >Yes</button>\n\n            <button\n              on-tap="answer:[\'N\', {{ questionid }}]"\n              class="button small\n                {{#(answer !== \'N\')}}info{{/()}}\n                {{#(answer === \'N\')}}active primary{{/()}}"\n            >No</button>\n\n            <button\n              on-tap="answer:[\'S\', {{ questionid }}]"\n              class="button small\n                {{#(answer !== \'S\')}}button-link{{/()}}\n                {{#(answer === \'S\')}}active primary{{/()}}"\n            >Skip</button>\n\n          </div>\n        </div>\n      {{/questions}}\n    </div>\n\n\n\n  </div>\n\n  <div class="footnote-container">\n    <div class="footnote">\n      <p>Some code, techniques, and data on <a href="https://github.com/minnpost/minnpost-hennepin-county-3rd-commissioner-primary-candidates" target="_blank">Github</a>.</p>\n    </div>\n  </div>\n</div>\n';});


define('text!templates/loading.mustache',[],function () { return '<div class="loading-container">\n  <div class="loading"><span>Loading...</span></div>\n</div>';});


/**
 * Views
 *
 * Ractive classes can be extended but we still need a number of
 * things at instantian, like templates
 */
define('views', ['jquery', 'underscore', 'ractive', 'ractive-backbone', 'ractive-events-tap',
  'helpers',
  'text!templates/application.mustache',
  'text!templates/loading.mustache'
],
  function($, _, Ractive, RactiveB, RactiveEventTap, helpers, tApplication, tLoading) {
  var views = {};

  // Base view to extend from
  views.Base = Ractive.extend({
    baseInit: function(options) {
      this.app = options.app;
    },
    adapt: [ 'Backbone' ]
  });

  // View for application container
  views.Application = views.Base.extend({
    template: tApplication,
    partials: {
      loading: tLoading
    },
    init: function() {
      var thisView = this;
      this.baseInit.apply(this, arguments);

      // This is the best place to stick the top nav.  Only make it happen
      // once the candidates are loaded
      this.observe('candidates', function(n, o) {
        if (!_.isUndefined(n) && !thisView.stuck) {
          // Hack around IE8 being stupid.  The wait is just an insurance that
          // the DOM has been loaded.
          var wait = (helpers.isMSIE() <= 8) ? 1200 : 500;

          _.delay(function() {
            $(thisView.el).find('.top-container').mpStick({});
          }, wait);
          thisView.stuck = true;
        }
      }, { defer: true });
    }
  });

  // Return what we have
  return views;
});


define('text!../data/preferences.json',[],function () { return '{"Candidate guide to Hennepin County 3rd Commissioner Primary":{"Questions":[{"category":"Partisanship","question":"Do you want a candidate who sought DFL endorsement?","eliminatesony":"carney, reuer","eliminatesonn":"greene, mavity, kelash, schweigert","unknownstance":"","na":"","rowNumber":1},{"category":"Endorsements","question":"Do you want a candidate endorsed by the GOP?","eliminatesony":"greene, mavity, kelash, schweigert, reuer","eliminatesonn":"carney","unknownstance":"","na":"","rowNumber":2},{"category":"Endorsements","question":"Do you want a candidate endorsed by the entire St. Louis Park City Council, State Rep. Ryan Winkler and State Sen. Ron Latz?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":3},{"category":"Endorsements","question":"Do you want a candidate endorsed by Stonewall DFL, Hennepin Commissioner Higgins, State Rep. Hornstein, Minneapolis school board members Mammen, Monserrate & Gagnon?","eliminatesony":"mavity, carney, reuer, kelash, schweigert","eliminatesonn":"greene","unknownstance":"","na":"","rowNumber":4},{"category":"Endorsements","question":"Do you want a candidate endorsed by former NRP director Bob Miller, State Rep. Joe Mullery and Minneapolis Parks Commissioner Jon Olson? ","eliminatesony":"mavity, carney, reuer, schweigert, greene","eliminatesonn":"kelash","unknownstance":"","na":"","rowNumber":5},{"category":"Endorsements","question":"Do you want a candidate endorsed by County Attoney Mike Freeman and State Reps. Karen Clark & Susan Allen?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":6},{"category":"Union support","question":"Do you want a candidate with union support?","eliminatesony":"greene, carney, reuer","eliminatesonn":"mavity, kelash, schweigert","unknownstance":"","na":"","rowNumber":7},{"category":"Union support","question":"Do you want a candidate supported by AFSCME, Teamsters, and Hennepin County Sheriff’s Deputies?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":8},{"category":"Union support","question":"Do you want a candidate supported by the Carpenters, Building Trades, Laborers, and Locomotive Workers?","eliminatesony":"mavity, greene, carney, reuer, schweigert","eliminatesonn":"kelash","unknownstance":"","na":"","rowNumber":9},{"category":"Union support","question":"Do you want a candidate supported by the Sheet Metal Workers?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":10},{"category":"Elected experience","question":"Do you want a candidate with previous elected experience?","eliminatesony":"carney, reuer, schweigert","eliminatesonn":"greene, kelash, mavity","unknownstance":"","na":"","rowNumber":11},{"category":"Southwest LRT","question":"Do you want a candidate who would replace Southwest LRT with busways?","eliminatesony":"greene, mavity, kelash, schweigert, reuer","eliminatesonn":"carney","unknownstance":"","na":"","rowNumber":12},{"category":"Residence","question":"Do you want a candidate who lives in Minneapolis?","eliminatesony":"mavity","eliminatesonn":"greene, carney, reuer, kelash, schweigert","unknownstance":"","na":"","rowNumber":13},{"category":"Residence","question":"Do you want a candidate who lives in St. Louis Park?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":14},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who endorsed Mark Andrew for 2013 Minneapolis mayor?","eliminatesony":"carney, reuer, schweigert, mavity","eliminatesonn":"greene, kelash","unknownstance":"","na":"","rowNumber":15},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who voted Betsy Hodges first in the 2013 Minneapolis mayoral election?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":16},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who voted Cam Winton first in the 2013 Minneapolis mayoral election?","eliminatesony":"mavity, greene, carney, kelash, schweigert","eliminatesonn":"reuer","unknownstance":"","na":"","rowNumber":17},{"category":"Experience","question":"Do you want a candidate who served on the boards of OutFront Minnesota and Minnesotans United for All Families?","eliminatesony":"mavity, carney, reuer, kelash, schweigert","eliminatesonn":"greene","unknownstance":"","na":"","rowNumber":18},{"category":"Experience","question":"Do you want a candidate who served on the Hennepin County Workforce Board?","eliminatesony":"greene, carney, reuer, schweigert","eliminatesonn":"mavity, kelash","unknownstance":"","na":"","rowNumber":19},{"category":"Experience","question":"Do you want a candidate who has worked as a Hennepin County prosecutor?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":20}],"Candidates":[{"candidateid":"carney","name":"Bob Carney Jr.","last":"Carney","profileurl":"http://www.minnpost.com/community-voices/2014/04/hennepin-commissioner-candidate-demand-southwest-lrt-alternatives","rowNumber":1},{"candidateid":"reuer","name":"Bob Reuer","last":"Reuer","profileurl":"","rowNumber":2},{"candidateid":"greene","name":"Marion Greene","last":"Greene","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-marion-greene","rowNumber":3},{"candidateid":"mavity","name":"Anne Mavity","last":"Mavity","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-anne-mavity","rowNumber":4},{"candidateid":"kelash","name":"Ken Kelash","last":"Kelash","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-ken-kelash","rowNumber":5},{"candidateid":"schweigert","name":"Ben Schweigert","last":"Schweigert","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-ben-schweigert","rowNumber":6}]}}';});

/**
 * Main application file for: minnpost-hennepin-county-3rd-commissioner-primary-candidates
 *
 * This pulls in all the parts
 * and creates the main object for the application.
 */

// Create main application
define('minnpost-hennepin-county-3rd-commissioner-primary-candidates', [
  'jquery', 'underscore',
  'mpConfig', 'mpFormatters', 'mpNav',
  'helpers', 'models', 'collections', 'views',
  'text!../data/preferences.json'
], function(
  $, _, mpConfig, mpFormatters, mpNav,
  helpers, models, collections, views,
  tDataPreferences
  ) {

  // Constructor for app
  var App = function(options) {
    this.options = _.extend(this.defaultOptions, options);
    this.el = this.options.el;
    this.$el = $(this.el);
    this.$ = function(selector) { return this.$el.find(selector); };
    this.$content = this.$el.find('.content-container');
    this.loadApp();
  };

  // Extend with custom methods
  _.extend(App.prototype, {
    // Start function
    start: function() {
      var thisApp = this;

      // Load data into models/collections
      this.loadData();

      // Create main view
      this.applicationView = new views.Application({
        el: this.$el,
        data: {
          options: this.options,
          candidates: this.candidates,
          questions: this.questions,
          categories: this.categories
        },
        app: this
      });

      // Handle events
      this.handleEvents();
    },

    // Event handling for various things that cross multiple objects
    handleEvents: function() {
      var thisApp = this;

      // Answering question
      this.applicationView.on('answer', function(e, params) {
        e.original.preventDefault();
        var answer = params[0];
        var qid = params[1];
        var question = thisApp.questions.get(qid);
        // check if unanswerable
        if (question.get('state') !== 'unanswerable') {
          question.set('answer', answer);
        }
      });

      // Clear all answers
      this.applicationView.on('clearQuestions', function(e) {
        e.original.preventDefault();
        thisApp.questions.setAll('answer', null);
        // Since any questions that haven't been answered will not get a
        // change event, we force this
        thisApp.questions.setAll('state', 'unanswered');
      });

      // When answers change, rebuild candidate elimination
      this.questions.on('change:answer', function(question, answer) {
        // Firgure out state of question
        question.set('state', (answer === null) ? 'unanswered' : 'answered');
        // Figure out what candidates and questions are eliminated
        thisApp.eliminateCandidates();
        thisApp.eliminateQuestions();
      });

      // Keep a list of candidates in the race
      this.candidates.on('change:eliminated', function(candidate, eliminated) {
        thisApp.applicationView.set('candidatesLeft', thisApp.candidates.where({ eliminated: false }));
      });
    },

    // Eliminate questions.  If a question will not affect the candidate
    // outcome, then there's no reason to show it.
    eliminateQuestions: function() {
      var eliminated = _.pluck(this.candidates.where({ eliminated: true }), 'id');
      var available = _.pluck(this.candidates.where({ eliminated: false }), 'id');

      // Reset any unanswerables
      this.questions.each(function(q, qi) {
        q.set('state', (q.get('state') === 'unanswerable') ? 'unanswered' : q.get('state'));
      });

      // If there is only one or less candidates then all questions are done
      if (this.candidates.length - eliminated.length <= 1) {
        this.questions.each(function(q, qi) {
          q.makeUnanswerable();
        });
      }
      else {
        // Determine if the candidates left could be split up by
        // a question.  So check if the available are either all or none
        // in a Y answer (TODO look further if there are unknown answers)
        this.questions.each(function(q, qi) {
          var diff = _.difference(available, q.get('eliminatesony'));
          if (q.get('state') !== 'answered' && (_.isEmpty(diff) || _.isEqual(diff, available))) {
            q.makeUnanswerable();
          }
        });
      }
    },

    // Candidate elimnation.  Go through each question and see
    // if one elimates a candidate.  It only needs to be elimnated once.
    eliminateCandidates: function() {
      var thisApp = this;

      // Reset
      this.candidates.setAll('eliminated', false);

      // Mark
      this.questions.each(function(q, qi) {
        if (q.get('answer') === 'Y') {
          _.each(q.get('eliminatesony'), function(c, ci) {
            thisApp.candidates.get(c).set('eliminated', true);
          });
        }
        if (q.get('answer') === 'N') {
          _.each(q.get('eliminatesonn'), function(c, ci) {
            thisApp.candidates.get(c).set('eliminated', true);
          });
        }
      });
    },

    // Load data.  Note that we will be storing the user data in here
    // as we are not persisting user input anywhere outside.
    loadData: function() {
      var questionsSheet = 'Questions';
      var candidatesSheet = 'Candidates';

      // Process the raw data
      this.rawData = JSON.parse(tDataPreferences);
      // The data is keyed by the title of the sheet and we don't care
      this.rawData = this.rawData[_.keys(this.rawData)[0]];

      // Transform candidates
      this.candidates = new collections.Candidates(
        _.map(this.rawData[candidatesSheet], function(r, ri) {
          r.eliminated = false;
          return r;
        }),
        { app: this }
      );

      // Transform questions
      this.questions = new collections.Questions(
        _.map(this.rawData[questionsSheet], function(r, ri) {
          r.eliminatesonn = _.filter(_.map(r.eliminatesonn.split(','), $.trim), function(i, ii) {
            return !!i;
          });
          r.eliminatesony = _.filter(_.map(r.eliminatesony.split(','), $.trim), function(i, ii) {
            return !!i;
          });
          r.unknownstance = _.filter(_.map(r.unknownstance.split(','), $.trim), function(i, ii) {
            return !!i;
          });
          r.categoryid = mpFormatters.identifier(r.category);
          r.questionid = _.uniqueId('question-');
          r.state = 'unanswered';
          r.answer = null;
          return r;
        }),
        { app: this }
      );

      // Make categories
      this.categories = new collections.Categories(
        this.questions.map(function(q, qi) {
          return q.pick('category', 'categoryid');
        }),
        { app: this }
      );
    },

    // Default options
    defaultOptions: {
      projectName: 'minnpost-hennepin-county-3rd-commissioner-primary-candidates',
      remoteProxy: null,
      el: '.minnpost-hennepin-county-3rd-commissioner-primary-candidates-container',
      availablePaths: {
        local: {

          css: ['.tmp/css/main.css'],
          images: 'images/',
          data: 'data/'
        },
        build: {
          css: [
            '//netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.css',
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.css',
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.css'
          ],
          ie: [
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.ie.css',
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.ie.css'
          ],
          images: 'dist/images/',
          data: 'dist/data/'
        },
        deploy: {
          css: [
            '//netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.css',
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.css',
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.css'
          ],
          ie: [
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.ie.css',
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.ie.css'
          ],
          images: 'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/images/',
          data: 'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/data/'
        }
      }
    },

    // Load up app
    loadApp: function() {
      this.determinePaths();
      this.getLocalAssests(function(map) {
        this.renderAssests(map);
        this.start();
      });
    },

    // Determine paths.  A bit hacky.
    determinePaths: function() {
      var query;
      this.options.deployment = 'deploy';

      if (window.location.host.indexOf('localhost') !== -1) {
        this.options.deployment = 'local';

        // Check if a query string forces something
        query = helpers.parseQueryString();
        if (_.isObject(query) && _.isString(query.mpDeployment)) {
          this.options.deployment = query.mpDeployment;
        }
      }

      this.options.paths = this.options.availablePaths[this.options.deployment];
    },

    // Get local assests, if needed
    getLocalAssests: function(callback) {
      var thisApp = this;

      // If local read in the bower map
      if (this.options.deployment === 'local') {
        $.getJSON('bower.json', function(data) {
          callback.apply(thisApp, [data.dependencyMap]);
        });
      }
      else {
        callback.apply(this, []);
      }
    },

    // Rendering tasks
    renderAssests: function(map) {
      var isIE = (helpers.isMSIE() && helpers.isMSIE() <= 8);

      // Add CSS from bower map
      if (_.isObject(map)) {
        _.each(map, function(c, ci) {
          if (c.css) {
            _.each(c.css, function(s, si) {
              s = (s.match(/^(http|\/\/)/)) ? s : 'bower_components/' + s + '.css';
              $('head').append('<link rel="stylesheet" href="' + s + '" type="text/css" />');
            });
          }
          if (c.ie && isIE) {
            _.each(c.ie, function(s, si) {
              s = (s.match(/^(http|\/\/)/)) ? s : 'bower_components/' + s + '.css';
              $('head').append('<link rel="stylesheet" href="' + s + '" type="text/css" />');
            });
          }
        });
      }

      // Get main CSS
      _.each(this.options.paths.css, function(c, ci) {
        $('head').append('<link rel="stylesheet" href="' + c + '" type="text/css" />');
      });
      if (isIE) {
        _.each(this.options.paths.ie, function(c, ci) {
          $('head').append('<link rel="stylesheet" href="' + c + '" type="text/css" />');
        });
      }

      // Add a processed class
      this.$el.addClass('inline-processed');
    }
  });

  return App;
});


/**
 * Run application
 */
require(['jquery', 'minnpost-hennepin-county-3rd-commissioner-primary-candidates'], function($, App) {
  $(document).ready(function() {
    var app = new App();
  });
});


// Hack back in the original jQuery
if (typeof window._jQuery != 'undefined') {
  window.jQuery = window._jQuery;
  window.$ = window._$;
}
