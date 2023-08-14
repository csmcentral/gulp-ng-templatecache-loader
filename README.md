# gulp-ng-templatecache-loader

This is a fork of [gulp-ng-templatecache-loader](https://github.com/softlife/gulp-ng-templatecache-loader)

Parse custom, [htmlprocessor] style build blocks in HTML files to build a javascript file 
to preload the [AngularJS] template cache using the [$templateCache] service. Uses
[gulp-angular-templatecache] to build a cache loader file with template files specified in
the application HTML page that uses them.

This plugin returns a stream that:

  1. Consumes HTML files with `<!-- templates:build -->` comment blocks, 
  2. Parses the blocks for the list of template files to include in cache loader file.
  3. Modifies the blocks to include a `<script>` tag to load the file.
  4. Passes the files through [gulp-angular-templatecache] to build the file.
  5. Logs creation of the new file.
  6. Produces the modified HTML files and the new template cache loader files.

## Install

Install with **npm**

```
npm install --save-dev gulp-ng-templatecache-loader
```

## Usage

Builds javascript file to load the AngularJS template cache from multiple files.

## Gulpfile

```js
var templates = require('gulp-ng-templatecache-loader');

gulp.task('build-templates', function() 
  {
  return gulp.src(['**/*.html', '!**/*.template.html'], { base:'.' }) 
            .pipe(templates())
            .pipe(gulp.dest('dest'));
  });
```

## Comment Markup

```html
<!-- templates:build: module='ModuleName'
                      source='myapp/templates'
                      source='/common/templates'
                      target='appTemplates.js' /templates -->
```

### module {string}

Angularjs module name for `run` block creation.

### source {string} [source='.']

Source path of template HTML files. Multiples are allowed. The [sourceFilter](#sourceFilter)
expression is joined to the path. All matching files will be included in the template cache loader. 

The [$templateCache] **Template IDs** (URLs) are defined by this path. If the path has a 
leading slash (/), all the HTML files found will have Template IDs that are absolute URLs
relative to the [base](###base) path option. If no leading slash, Template IDs will be relative
to the input file folder.

For example, given the above Gulp configuration and this working structure:
```
/home/dev
    gulpfile.js
    /apps
        myapp.html
        myapp/templates/
            module1.template.html
            module2.template.html
    /common/templates/
        module1.template.html
        module2.template.html
```
The **Template ID**s will be:
```
myapp/templates/module1.template.html
myapp/templates/module2.template.html
/common/templates/module1.template.html
/common/templates/module2.template.html
```

### target {string} [target='./templates.js']

Target cache loader javascript file path. If the path has a leading slash (/), it is used
as given. Relative paths will be rooted at the folder of the input file.

This file will wrap the contents of the **_source_** files with an 
`angular.module('ModuleName').run(function($templateCache)` block.

## Options

### addInclude {boolean} [addInclude=true]
Modifies the comment block in the input file to include a "&lt;script&gt;" tag for **target** such 
that the comment block shown above will become:
```html
<!-- templates:build: module='ModuleName'
                      source='source1/file/'
                      source='source2/file/**/*.template.html'
                      target='target/file/path.js' -->
<script type="text/javascript" src="/target/file/path.js"></script> 
<!-- /templates -->
```

### fileName {string} [fileName='templates.js']

The name of the target javascript file to use.

### quiet {boolean} [quiet=false]

Suppresses log messages.

### replaceBlock {boolean} [replaceBlock=false]

Replaces the entire comment block with the include statement. Used to create the page 
for the final build. If *addInclude* is *false*, the block will simply be removed.

### sourceFilter {string|array} [sourceFilter='\*\*/*.template.html']

Glob filter to apply to list of files found in comment block **source** paths.

### transform {function}

Function returning a stream to transform templates before adding to cache loader.
For example, to minify the template files:

```js
var templates  = require('gulp-ng-templatecache-loader');
var minifyHTML = require('gulp-minify-html');
var transform  = function() { return minifyHTML(); };

gulp.task('build-templates', function() 
  {
  return gulp.src(['**/*.html', '!**/*.template.html'], { base:'.' }) 
            .pipe(templates({transform:transform}))
            .pipe(gulp.dest('dest'));
  });
```

[AngularJS]:                  https://angularjs.org/
[$templateCache]:             https://docs.angularjs.org/api/ng/service/$templateCache
[htmlprocessor]:              https://github.com/dciccale/node-htmlprocessor
[gulp-angular-templatecache]: https://github.com/miickel/gulp-angular-templatecache
