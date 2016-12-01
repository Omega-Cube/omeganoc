/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

/* globals requirejs, onoc_main_modules, ONOC */

// Omega Noc main launcher script
// This script configures Require.js and loads the actual starting script for the currently loading page

// Configure RequireJS
requirejs.config({
    // Shims
    shim: {
        'libs/jquery.hashchange': ['jquery'],
        'libs/jquery.scrollbar': ['jquery'],
        'libs/jstree': ['jquery'],
        'libs/gridster': ['jquery'],
        'libs/svg.easing': ['libs/svg'],
        'libs/select2': ['jquery']
    },
    // Paths
    paths: {
        'widget': '../../widgets',
        // A special case for jQuery, who has a mandatory export name
        // http://www.requirejs.org/docs/jquery.html#modulename
        'jquery': 'libs/jquery'
    }
});

requirejs(['jquery','onoc.tooltips', 'onoc.config'], function(jQuery, Tooltips, Config) {
    var onoc_start = function(module) {
        if(typeof(module) === 'string') {
            module = [module];
        }

        return requirejs(module);
    };

    Config.setValues(ONOC.url_root, ONOC.separator, ONOC.is_admin, ONOC.shinken_contact);

    jQuery(document).ready(function() {
        var help = new Tooltips();
        help.bind(jQuery('#content'));
        if(onoc_main_modules && onoc_main_modules.length > 0) {
            onoc_start(onoc_main_modules);
        }
    });
});
