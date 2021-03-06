/**
 * fontfacegen
 * https://github.com/agentk/fontfacegen
 *
 * Copyright (c) 2014 Karl Bowden
 * Licensed under the MIT license.
 */

'use strict';

var

fs     = require('fs'),
cp     = require ('child_process'),
path   = require('path'),
exec   = require('sync-exec'),
mkdirp = require('mkdirp'),

requiredCommands = ['fontforge', 'ttfautohint', 'ttf2eot', 'batik-ttf2svg'],

weight_table = {
    thin:           '100',
    extralight:     '200',
    light:          '300',
    book:           'normal',
    normal:         'normal',
    regular:        'normal',
    medium:         '500',
    demibold:       '600',
    demi:           '600',
    semibold:       '700',
    bold:           '700',
    extrabold:      '800',
    black:          '900',
    heavy:          '900',
},


// ----------------------------------------------------------------------------

generateFontFace = function(options) {

    generateGlobals(options);
    var config = generateConfig(options);

    createDestinationDirectory(config.dest_dir);
    // generateTtf(config);
    generateEot(config);
    // generateSvg(config);
    generateWoff(config);
    generateStylesheet(config);

    return config.fonts
},


// ----------------------------------------------------------------------------

globals = null,

generateGlobals = function(options) {
    var missing = [];
    globals = {};

    requiredCommands.forEach(function(cmd){
        if (options[cmd]) {
            globals[cmd] = options[cmd];
        } else {
            globals[cmd] = commandPath(cmd);
        }
        if (!globals[cmd]) {
            missing.push(cmd);
        }
    });

    if (missing.length) {
        throw new FontFaceException(
            'We are missing some required font packages.\n' +
            'That can be installed with:\n' +
            'brew install ' + missing.join(' '));
    }

    // Only needs to be done once
    generateGlobals = function(){}
},

generateConfig = function(options) {
    var _ = {
        source   : options.source,
        dest_dir : options.dest,
        collate  : options.collate || false
    };

    _.extension    = path.extname(_.source);
    _.basename     = path.basename(_.source, _.extension);
    _.dest_dir     = _.collate ? path.join(_.dest_dir, _.basename) : _.dest_dir;
    _.target       = path.join(_.dest_dir, _.basename);
    _.config_file  = _.source.replace(_.extension, '') + '.json';
    _.ttf          = _.source;
    _.eot          = [_.target, '.eot'].join('');
    _.svg          = [_.target, '.svg'].join('');
    _.woff         = [_.target, '.woff'].join('');
    _.css          = [_.target, '.css'].join('');
    _.css_fontpath = '../';
    _.name         = getFontName(_.source);
    _.weight       = getFontWeight(_.source);
    _.style        = getFontStyle(_.source);
    _.embed        = [];

    if (fs.existsSync(_.config_file)) {
        merge(_, JSON.parse(fs.readFileSync(_.config_file)));
    }

    merge(_, options);

    return _;
},

createDestinationDirectory = function(dest) {
    if (!fs.existsSync(dest)) {
        mkdirp.sync(dest);
    }
},

generateTtf = function(config) {

    var script = 'Open($1);SetFontNames($3,$3,$3);Generate($2, "", 8);',
        source = config.source,
        target = config.ttf,
        name   = config.name;

    return fontforge(script, source, target, name);
},

generateEot = function(config) {

    var source = config.ttf,
        target = config.eot;

    return ttf2eot(source, target);
},

generateSvg = function(config) {

    var source = config.ttf,
        target = config.svg,
        name   = config.name;

    return ttf2svg(source, target, name);
},

generateWoff = function(config) {

    var script = 'Open($1);Generate($2, "", 8);',
        source = config.source,
        target = config.woff;

    return fontforge(script, source, target);
},

generateStylesheet = function(config) {
    var name, filename, weight, style, stylesheet, result, woff, ttf;

    name       = config.name;
    filename   = (config.collate)
        ? path.join(config.css_fontpath, config.basename, config.basename)
        : path.join(config.css_fontpath, config.basename);
    weight     = config.weight;
    style      = config.style;
    stylesheet = config.css;
    woff       = '"' + filename + '.woff"';
    ttf        = '"' + filename + '.ttf"';

    if (has(config.embed, 'woff')) {
        woff = embedFont(config.woff);
    }
    if (has(config.embed, 'ttf')) {
        ttf = embedFont(config.ttf);
    }
    var styleWeight = weight.slice(0,1);
    var styleStyle = style.slice(0,1);
    result = [
        '@font-face {',
        '    font-family: "' + name + '";',
        '    src: url("' + filename + '.eot");',
        '    src: local("☺︎"), url('  + woff     + ') format("woff");',
        '    font-weight: ' + weight + ';',
        '    font-style: normal;',
        '}',
        '@ff-'+styleWeight+'-'+styleStyle+': "'+ name +'", helvetica, arial, sans-serif;',
        '.ff-'+styleWeight+'-'+styleStyle+'(){',
        'font-family:'+'@ff-'+styleWeight+'-'+styleStyle+';',
        '}'
        ].join("\n");

    fs.writeFileSync(stylesheet, result);
    return result;
},


// ----------------------------------------------------------------------------

getFontName = function(source) {
    var res = '';
    var result = fontforge('Open($1);Print($fontname);', source);
    if (result.stdout) {
        res = result.stdout.trim().replace(' ', '_');
        if (res != 'false') 
            {console.log(res);return res}
        else {
            var lastIndex = source.lastIndexOf('/') + 1;
            var dotIndex = source.lastIndexOf('.');
            var res = source.slice(lastIndex,dotIndex);
            console.log(res);
            return res
        }
    }
    return false
},

getFontWeight = function(source) {
    var result = fontforge('Open($1);Print($weight);', source);
    if (result.stdout) {
        var weight = result.stdout.trim().replace(' ', '').toLowerCase();
        if (weight_table[weight])
            return weight_table[weight];
        return weight;
    }
    return false;
},

getFontStyle = function(source) {
    var result = fontforge('Open($1);Print($italicangle);', source);
    if (result.stdout) {
        return (result.stdout.trim() == 0) ? 'normal' : 'italic';
    }
    return false;
},


// ----------------------------------------------------------------------------

FontFaceException = function(message) {
   this.message = message;
   this.name = "FontFaceException";
},

merge = function(destination, source) {
    for (var property in source) {
        if (source.hasOwnProperty(property)) {
            destination[property] = source[property];
        }
    }
    return destination;
},

commandPath = function(command) {
    var result = exec('which ' + command);
    if (result.status == 0)
        return result.stdout.trim();
    return false;
},

fontforge = function() {
    var args, script, command, result, success;

    args = Array.prototype.slice.call(arguments);
    if (args.length < 1) {
        return false;
    }

    script = args.shift();

    command = globals.fontforge +
        ' -lang=ff -c \'' + script + '\'';

    args.forEach(function(arg){
        command += ' \'' + arg + '\'';
    });

    result = exec(command + ' 2> /dev/null');
    success = (result.status == 0);

    if (! success) {
        throw new FontFaceException(
            'FontForge command failed\n' +
            'From command: ' + command + '\n' +
            'Code: ' + result.code + '\n' +
            result.stdout.trim());
    }
    return result;
},

ttf2eot = function(source, dest) {
    var command, result, success;

    command = [globals.ttf2eot, quote(source), '>', quote(dest)].join(' ');

    result = cp.exec(command, {max_wait:1000}, function(err){
        if (err) throw err;
    });
    return result;
},

ttf2svg = function(source, target, name) {
    var command, result, success;

    command = [globals['batik-ttf2svg'], quote(source), '-id', quote(name), '-o', quote(target)].join(' ');
    result = exec(command);
    success = (result.status == 0);

    if (! success) {
        throw new FontFaceException(
            'ttf2eot exited with error code: ' + result.code + '\n' +
            result.stdout.trim() + '\n' +
            'Your SVG file will probably not be in a working state');
    }
    return result;
},

// Convert font file to data:uri and *remove* source file.
embedFont = function(fontFile) {
    var dataUri, type, fontUrl;

    // Convert to data:uri
    dataUri = fs.readFileSync(fontFile, 'base64');
    type = path.extname(fontFile).substring(1);
    fontUrl = 'data:application/x-font-' + type + ';charset=utf-8;base64,' + dataUri;

    // Remove source file
    fs.unlinkSync(fontFile);

    return fontUrl;
},

quote = function(str) {
    return '"' + str + '"';
},

has = function(haystack, needle) {
    return haystack.indexOf(needle) !== -1;
};




module.exports = generateFontFace;

