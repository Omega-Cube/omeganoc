'use strict';

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
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
define(function () {
    // This function will load the specified CSS file on demand.
    // It will avoid loading a file that was loaded previously.
    // Note however that loaded files are compared with the URL provided
    // tod the function. Therefore, a single script accessed through two
    // different URLs may be loaded twice by the browser.
    function loadcss(url) {
        // Check if the file wasn't already loaded
        if (!('loadlist' in loadcss))
            loadcss.loadlist = {};
        if (loadcss.loadlist[url])
            return; // Already loaded. exit.

        var link = document.createElement('link');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.href = url;
        document.getElementsByTagName('head')[0].appendChild(link);

        loadcss.loadlist[url] = true;
    }

    return loadcss;
});
