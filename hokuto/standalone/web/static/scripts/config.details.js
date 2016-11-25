'use strict';

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2015 Omega Cube and contributors
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
define(['jquery', 'config.infobar', 'libs/select2', 'libs/jquery.validate'], function(jQuery, initInfobar){
    jQuery(function() {
        initInfobar();
        
        // Select2 lists
        jQuery('select[multiple]').select2({
            width: '400px',
            placeholder: 'Empty list',
        });

        // Open / collapse fieldsets
        jQuery('form > fieldset > legend').click(function() {
            jQuery(this).parent().toggleClass('collapsed');
        });
    });
});
