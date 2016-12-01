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

require(['jquery'], function(jQuery) {
    function _columns_getAllColumnsWidth() {
        var cols = jQuery('aside');
        var result = 0;
        cols.each(function (i, e) {
            e = jQuery(e);
            result += e.width();
        });

        return result;
    }

    function _columns_updateMiddleSize(columnsSize) {
        var middle = document.getElementById('middle');
        middle.style.width = '-webkit-calc(100% - ' + columnsSize + 'px)';
        //middle.style.width = "-moz-calc(100% - " + columnsSize + "px)";
        middle.style.width = 'calc(100% - ' + columnsSize + 'px)';
    }


    jQuery(document).ready(function () {
        var buttons = jQuery('.collapser');

        buttons.each(function (i, e) {
            jQuery(e).click(function () {
                var button = jQuery(this);

                if (button.data('activated')) {
                    button.data('activated', false);
                    button.parent().removeClass('hide');
                }
                else {
                    button.data('activated', true);
                    button.parent().addClass('hide');
                }

                var cols = _columns_getAllColumnsWidth();
                _columns_updateMiddleSize(cols);

                // Notify anyone interested that the columns size were updated
                jQuery(document).trigger('columnsresized.onoc');
            });
        });
    });
});
