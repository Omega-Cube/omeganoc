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
define(['jquery'], function (jQuery) {

    var defaults = {
        minHeight: '20px',
        toggleSelector: '.messagePaneButton',
        toggleIsInArea: true,
        expandClass: 'panel-expanded',
        collapseClass: 'panel-collapsed'
    };

    jQuery.fn.messagePane = function (options) {
        var settings = jQuery.extend({}, defaults, options);
        var maskTrans = 'height 0.5s';

        this.each(function () {
            var that = jQuery(this);
            var toggleButton = null;
            if (options.toggleIsInArea) {
                toggleBtn = jQuery(settings.toggleSelector, this);
            }
            else {
                toggleBtn = jQuery(settings.toggleSelector);
            }

            if (toggleBtn && toggleBtn.length > 0) {
                toggleBtn.click(function (e) {
                    var that = jQuery(this);
                    var panel = jQuery(that.data('messagePaneTarget'));
                    var mask = panel.parent();
                    var data = jQuery(panel).data('messagePane');

                    if (data.collapsed) {
                        // Show
                        var height = panel.height();
                        mask.css('height', height);
                        panel.removeClass(data.collapseClass);
                        panel.addClass(data.expandClass);
                    }
                    else {
                        // Hide
                        mask.css('height', data.minHeight);
                        panel.removeClass(data.expandClass);
                        panel.addClass(data.collapseClass);
                    }

                    data.collapsed = !data.collapsed;

                    e.preventDefault();
                });
            }

            // Link button to associated area
            toggleBtn.data('messagePaneTarget', this);

            // Add starting CSS class
            that.addClass(settings.collapseClass);

            // Wrap the panel into a mask
            var mask = jQuery('<div />');
            mask.css({
                position: 'relative',
                overflow: 'hidden',
                height: settings.minHeight,
                transition: maskTrans,
                MozTransition: maskTrans,
                OTransition: maskTrans,
                MsTransition: maskTrans,
                WebkitTransition: maskTrans
            });

            // Transfer the shadow properties over to the mask, so the shadow is still visible outside of the mask
            mask.css({
                'box-shadow': that.css('box-shadow'),
                '-ms-box-shadow': that.css('-ms-box-shadow'),
                '-moz-box-shadow': that.css('-moz-box-shadow'),
                '-o-box-shadow': that.css('-o-box-shadow'),
                '-webkit-box-shadow': that.css('-webkit-box-shadow')
            });
            that.css({
                'box-shadow': '',
                '-ms-box-shadow': '',
                '-moz-box-shadow': '',
                '-o-box-shadow': '',
                '-webkit-box-shadow': ''
            });

            // Wrap the mask into a placeholder
            // This placeholder will have a constant height,
            // with the mask extending out of it. This is so that
            // the target expands over its neighbors (neighbors are not
            // moved when the target expands/collapses)
            var placeholder = jQuery('<div />');
            placeholder.css({
                overflow: 'visible',
                position: 'relative',
                height: settings.minHeight
            });

            // Transfer the target's margin the the placeholder, as well as the z-index
            placeholder.css({
                'margin-top': that.css('margin-top'),
                'margin-right': that.css('margin-right'),
                'margin-bottom': that.css('margin-bottom'),
                'margin-left': that.css('margin-left'),
                'z-index': that.css('z-index')
            });
            that.css('margin', '0');

            placeholder.append(mask);
            that.wrap(placeholder);

            // Attach data
            var data = jQuery.extend({}, settings, {
                collapsed: true
            });

            that.data('messagePane', data);
        });
    };
});
