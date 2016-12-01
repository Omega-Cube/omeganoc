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


// This module contains a jQuery plugin.
// Its goal is simply to nicely show/hide/change a text using fading effects

define(['jquery'], function (jQuery) {
    // Key used to store the plugin tools in the targets data
    var dataKey = 'onocMessage';

    jQuery.fn.onocMessage = function () {
        return this.each(function() {
            setup(jQuery(this));
        });
    };

    // Private functions

    function setup(target) {
        // Message hidden by default
        target.hide();

        // Store plugin data
        target.data(dataKey, {
            text: null,
            isHidden: true,
            setText: function (text) {
                var data = target.data(dataKey);
                data.text = text;
                if (!data.isHidden) {
                    data.isHidden = true;
                    // Start hiding the text; we will actually change it once it's invisible
                    target.fadeOut(function () {
                        var newText = data.text;
                        if (newText) {
                            var $this = jQuery(this);
                            $this.text(newText).fadeIn();
                            $this.data(dataKey).isHidden = false;
                        }
                    });
                }
                else if (text) {
                    target.text(text).fadeIn();
                    data.isHidden = false;
                }
            },

        });
    }
});
