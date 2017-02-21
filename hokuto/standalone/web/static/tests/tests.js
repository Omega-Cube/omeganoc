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

// Main RequireJS entry point for the unit tests page
require.config({
    baseUrl: '../scripts',
    paths: {
        'jasmine': ['../tests/lib/jasmine/jasmine'],
        'jasmine-html': ['../tests/lib/jasmine/jasmine-html'],
        'jasmine-boot': ['../tests/boot'],
    },
    shim: {
        'jasmine-html': {
            deps: ['jasmine'],
        },
        'jasmine-boot': {
            deps: ['jasmine', 'jasmine-html'],
        },
    }
});

// Load jasmine
require(['jasmine-boot'], function(boot) {
    // Helper function for readability of the spec list
    function generateSpecs(specsList) {
        return specsList.map(function(mod) {
            return '../tests/spec/' + mod;
        });
    }

    require(generateSpecs(window.specs), function() {
        boot();
    });
});