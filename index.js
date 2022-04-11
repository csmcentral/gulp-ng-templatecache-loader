/*****************************************************************************************
* $Id$
/**
* Parse custom, [htmlprocessor] style build blocks in HTML files to build a javascript 
* file to preload the [AngularJS] template cache using the [$templateCache] service. Uses
* [gulp-angular-templatecache] to build a cache loader file with template files specified 
* in the application HTML page that uses them.
*
* @module gulp-ng-templatecache-loader
*****************************************************************************************/
module.exports = (function()
  {
  var gulp          = require('gulp');
  var colors        = require('ansi-colors');
  var streams       = require('event-stream');
  var log           = require('fancy-log');
  var filter        = require('gulp-filter');
  var ngTemplates   = require('gulp-angular-templatecache');
  var fixEOL        = require('gulp-eol');
  var HTMLProcessor = require('htmlprocessor');
  var os            = require('os');
  var path          = require('path');
  var Q             = require('q');
  var through       = require('through2');
  var Vinyl         = require('vinyl');

  /*****************************************************************************************
  * Configuration.
  *****************************************************************************************/
  var COMMENT_MARKER     = 'templates';
  var COMMENT_BLOCKTYPE  = 'build';
  var COMMENT_TAG        = COMMENT_MARKER+':'+COMMENT_BLOCKTYPE;
  var DEFAULT_OPTIONS =
    {
    addInclude:    true, 
    fileName:      'templates.js', 
    replaceBlock:  false,
    sourceFilter:  '**/*.template.html'
    };

  /***************************************************************************************
  * Searches input files for the "templates:build" comment block and builds the templates
  * cache loader javascript files. Input file comment blocks can be  modified to include 
  * the "<script>" tag to load the include file. Script files are added to the stream.
  *
  * @param   {boolean} options  Options:
  *   `fileName`     - Cache loadfile file name. Default="templates.js". May be overridden by
  *                    `target` parameter in parsed HTML file.
  *   `addInclude`   - `true` to add "<script>" tag to parsed HTML file. Tag is added to
  *                    comment block unless `replaceBlock` flag is set. Default == `true`.
  *   `replaceBlock' - `true` to replace/remove the comment block. Block is replaced with
  *                    "<script>" include tag if `addInclude` flag is set. Else, block is
  *                    removed. Default = `false`.
  *   `transform`    - Function returning a stream to pass template files through for 
  *                    modification before adding to the cache loader file.
  * @returns {stream}  Consumes HTML files that may contain "templates:build" comments.
  *                    Produces input files and created javascript files. Comments are 
  *                    modified according to options.
  ***************************************************************************************/
  var cacheLoader = function(options)
    {
    options = Object.assign({}, DEFAULT_OPTIONS, options);

    /*----------------------------------------*/
    /* Build the page processor and override  */
    /* the block types with our custom block. */
    /*----------------------------------------*/
    var pageProcessor         = new HTMLProcessor({ commentMarker: COMMENT_MARKER });
    var blockProcessor        = new BlockProcessor(options);
    pageProcessor._blockTypes = (function(t, h) { var o={}; o[t]=h; return o; })(COMMENT_BLOCKTYPE, blockProcessor.handler);

    /*--------------------------------------------------*/
    /* Search files in the input for the comment block. */
    /* Run these files through the block processor and  */
    /* build the templates cache loader file.           */
    /*--------------------------------------------------*/
    return through.obj(function(file, enc, cb)
      {
      var self         = this;
      var nextFile    = function(clFile) { self.push(file); if (clFile) self.push(clFile); cb(); };
      var handleError = function(error) { log.error(colors.magenta(path.relative(file.cwd, file.path))+':', colors.red(error.message)); nextFile(); }; 
      try
        {
        var contents = file.contents.toString(enc);
        if (contents.search(COMMENT_TAG) >= 0)
          {
//          ['cwd','base','path','relative'].forEach(function(p) { console.log(p,'=',file[p]); }); 
          file.contents = new Buffer(pageProcessor.processContent(contents, file.path), enc);
          cacheBuilder(options, file, blockProcessor.parms).then(
            function(clFile)
              {
              if (!options.quiet)
                {
                log('Created', colors.magenta(path.relative(clFile.cwd, clFile.path))+'.');
                if (options.addInclude || options.replaceBlock)
                  log('Updated', colors.magenta(path.relative(file.cwd, file.path))+'.');
                }
              nextFile(clFile);
              },
            handleError
            );
          }
        else
          nextFile();
        }
      catch(error)
        {
        handleError(error);
        }
      });
    };

  /***************************************************************************************
  * BlockProcessor */
  /**
  * "htmlprocessor" block handler. Parses "templates:build" comment block and modifies the
  * block according to `options`. `parms` object property contains properties parsed from
  * comment block:
  *   * `module`  - AngularJS module name.
  *   * `sources` - Array of "source" properties found in comment block. Default == ['.'].
  *   * `target`  - Target path for cache loader javascript file. Default == "templates.js".
  ***************************************************************************************/
  function BlockProcessor(options)
    {
    var self        = this;
    var reMarker    = new RegExp('(^\\s*)?<!--\\s+'+COMMENT_TAG+'\\s+([\\s\\S]+?)\\s*-->');
    var reEndMarker = new RegExp('\\s*/'+COMMENT_MARKER+'\\s*(?=-->)');
    var reParms     = /(module|source|target)\s*=\s*([\'"])([\w\s\/\.]+)\2/g;
    var reSpaces    = /^(\s*)/;
  
    /*---------------------------------------------------*/
    /* parms       - Criteria parsed from block tag.     */
    /* handler     - `htmlprocessor` block type handler. */
    /*---------------------------------------------------*/
    this.parms      = null;
    this.handler    = function(content, block, blockLine, blockContent) 
      {
      /*------------------------------------------------------------*/
      /* blockLine is the entire comment block from the begin       */
      /* marker to the end marker. Find the begin marker tag in     */
      /* the block and parse out the leading spaces and parameters. */
      /*------------------------------------------------------------*/
      var match = reMarker.exec(blockLine);

      if (!match)
        throw new Error('\''+COMMENT_TAG+'\' block not in correct format.');

      var open   = match[0];
      var lead   = match[1] || '';
      self.parms = { sources:[], target:options.fileName };
      
      /*---------------------------*/
      /* Parse out the parameters. */
      /*---------------------------*/
      for (var pair; pair = reParms.exec(match[2]);)
        if      (pair[1] === 'source')
          self.parms.sources.push(pair[3]);
        else if (pair[1] === 'target')
          self.parms.target = pair[3].replace(/\\/g, '/');
        else
          self.parms[pair[1]] = pair[3];

      if (!self.parms.module)
        throw new Error('\''+COMMENT_TAG+'\' block missing "module" value.');

      /*------------------------------------*/
      /* Source folder defaults to current. */
      /*------------------------------------*/
      if (!self.parms.sources.length)
        self.parms.sources.push('.');

      /*---------------------------*/
      /* Modify the comment block. */
      /*---------------------------*/
      if (options.addInclude || options.replaceBlock)
        {
        var output = [];

        /*--------------------------------------------------*/
        /* Remove the end marker if placed in the open tag. */
        /*--------------------------------------------------*/
        if (!options.replaceBlock)
          output.push(open.replace(reEndMarker, ' '));
          
        if (options.addInclude)
          output.push(lead+'<script type="text/javascript" src="'+self.parms.target+'"></script>');

        if (!options.replaceBlock)
          output.push(lead+'<!-- /'+COMMENT_MARKER+' -->');

        content = content.replace(blockLine, output.join(os.EOL));
        }

      return content;
      };
    }

  /***************************************************************************************
  * cacheBuilder */
  /**
  * Loads the HTML files from "specs" and builds the templates cache loader javascript
  * file using "angular-templatecache".
  *
  * @param   {object} options    Options:
  *   * `transform` - Function returning a stream to pass templates through.
  * @param   {object} inputFile  HTML file parsed for `specs`.
  * @param   {object} specs      Cache loader specifications:
  *   * `module`  - AngularJS module name.
  *   * `sources` - Array of folder paths to scan for HTML templates. Absolute paths are
  *                 relative to document root (current folder) and relative paths are 
  *                 relative to `inputFile` folder. These paths are used to set the 
  *                 Template IDs (URLs).
  *   * `target`  - Cache loader file path. Absolute path is relative to document root 
  *                 (current folder) and relative paths is relative to `inputFile` folder.
  * @returns {Promise} Resolved with cache loader file object. 
  ***************************************************************************************/
  function cacheBuilder(options, inputFile, specs)
    {
    /*------------------------------------------*/
    /* Set ngTemplates options. `base` function */
    /* returns `file.templateID` set below.     */
    /*------------------------------------------*/
    var ngOptions = 
      {
      base:           function(file) { return file.templateID },
      templateHeader: 'angular.module("'+specs.module+'").run(["$templateCache", function($templateCache) {\n',
      templateFooter: '\n}]);'
      };
  
    /*---------------------------------------------------------*/
    /* Set input file folder path relative to cwd. Templates   */
    /* file path provided in specs. If leading slash (/), path */
    /* is relative to cwd. Else, relative to `fileFolder`.     */
    /*---------------------------------------------------------*/
    var fileFolder = path.dirname(path.normalize(path.relative(inputFile.cwd, inputFile.path)));
    var targetFile = (specs.target[0] == '/' ? specs.target.substring(1) : path.join(fileFolder, specs.target));
  
    return Q.Promise(function(resolve, reject)
      {
      /*--------------------------------------------*/
      /* For each source spec, grab the HTML files. */
      /*--------------------------------------------*/
      streams.merge(specs.sources.map(function(source)
        {
        /*--------------------------------------------------*/
        /* If leading slash (/) in source path, base path   */
        /* is off cwd. Else, relative to input file folder. */
        /*--------------------------------------------------*/
        var fromRoot = (source[0] == '/');
        var basePath = (fromRoot ? source.substring(1) : path.join(fileFolder, source));
  
        return gulp.src(path.posix.join(basePath, '/**')).pipe(filter(options.sourceFilter))
        .pipe(streams.through(function(file)
          {
          /*-----------------------------------------------*/
          /* Set template ID (URL) on file object. `base`  */
          /* method in ngTemplates options will return it. */
          /*                                               */
          /* If source is rooted, URL is absolute from     */
          /* doc root (cwd). Else, relative to app.        */
          /*-----------------------------------------------*/
//          ['cwd','base','path','relative'].forEach(function(p) { console.log(p,'=',file[p]); }); 

          file.templateID = (fromRoot ? '/' : '')+path.relative(file.cwd, file.path);
          this.push(file);
          }));
        }))
  
      /*---------------------------------------------------*/
      /* Build cache loader file from all HTML files       */
      /* found. Pass through transform stream if provided. */
      /*                                                   */
      /* Note: `gulp-angular-templateCache` uses linux     */
      /* line endings. `gulp-eol` normalizes them.         */
      /*---------------------------------------------------*/
      .pipe(options.transform ? options.transform() : through.obj()) 
      .pipe(ngTemplates(path.basename(targetFile), ngOptions))
      .pipe(fixEOL(null, false))
      .pipe(streams.through(
        function(file) { resolve(new Vinyl({cwd:inputFile.cwd, path:targetFile, contents:file.contents})); },
        function()     { reject(new Error('No template files found.')); }
        ));
      });
    }

  /***************************************************************************************
  * Exports
  ***************************************************************************************/
  Object.defineProperty(cacheLoader, 'COMMENT_TAG', { get: function() { return COMMENT_TAG; }});

  return cacheLoader;
  })();
