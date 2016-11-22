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
define(['jquery'], function(jQuery) {
	var GraphTooltip = {
		_init: function () {
			// Create the tooltip container
			this._element = document.createElement('div');
			this._element.style.position = 'absolute';
			this._element.style.top = '0px';
			this._element.style.left = '0px';
			this._element.className = 'graph-tooltip';

			document.body.appendChild(this._element);
		},

		show: function (x, y, width, height, content) {
			var elm = jQuery(this._element);
			elm.empty().append(content);
			var elmw = elm.outerWidth();
			var elmh = elm.outerHeight();
			var viewportWidth = $(window).width();
			var maxX = viewportWidth - elmw;
			var xPos, yPos;

			var xPos = x + (width / 2) - (elmw / 2);
			if (xPos < 0)
				xPos = 0;
			if (xPos > maxX)
				xPos = maxX;

			// Try to put the tooltip over the target rectangle
			if (elmh < y) {
				yPos = y - elmh;
			}
			else {
				// Not enough space on the up side. So show it under the target
				yPos = y + height;
			}
			this._element.style.left = xPos + 'px';
			this._element.style.top = yPos + 'px';

			//this._element.style.display = 'block';
			jQuery(this._element).addClass('v');
		},

		hide: function () {
			//this._element.style.display = 'none';
			jQuery(this._element).removeClass('v');
		}
	};

	jQuery(document).ready(function () {
		GraphTooltip._init();
	});
	
	return GraphTooltip;
});
