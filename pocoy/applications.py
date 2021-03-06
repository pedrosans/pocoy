"""
Copyright 2017 Pedro Santos

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""
import os, glob, gi, sys
import xdg.DesktopEntry
import xdg.Exceptions
import pocoy.messages as messages
from gi.repository import Gdk, GLib, Gio, GdkX11
from datetime import datetime
from pocoy.messages import Message
from pocoy.wm import UserEvent
from gi.repository import Wnck, GdkX11, Gdk

APPS_GLOB = [
		"/usr/share/applications/*.desktop",
		"/var/lib/snapd/desktop/applications/*.desktop",
		os.path.expanduser('~/.local/share/applications')+'/*.desktop']
NAME_MAP = {}
LOCATION_MAP = {}
USER_SETUP = None
USER_SETUP_DATA = None
SPAWN_FLAGS = GLib.SpawnFlags.STDOUT_TO_DEV_NULL | GLib.SpawnFlags.STDERR_TO_DEV_NULL
DESKTOP_STARTUP_ID = "DESKTOP_STARTUP_ID"


def spawn(user_event: UserEvent):
	display: Gdk.Display = Gdk.Display.get_default()
	if os.fork() == 0:
		try:
			display.close()
			os.setsid()
			file = user_event.parameters[0]
			os.execvp(file, user_event.parameters)
		finally:
			exit(1)


def launch_from_name(user_event: UserEvent):
	name = user_event.vim_command_parameter if user_event.vim_command_parameter else user_event.parameters[0]
	app_info = info_for(name)
	if app_info:
		launch_app(app_info=app_info, timestamp=user_event.time)


def launch_from_commandline(user_event: UserEvent):
	cmd = user_event.parameters[0]
	app_info = Gio.DesktopAppInfo.create_from_commandline(cmd, None, Gio.AppInfoCreateFlags.NONE)
	launch_app(app_info)


spawn.skip_event_processing = False
launch_from_name.skip_event_processing = False
launch_from_commandline.skip_event_processing = False


def launch_app(app_info, timestamp: int = None, desktop: int = -1):
	if not timestamp:
		timestamp = datetime.now().microsecond

	try:
		display: Gdk.Display = Gdk.Display.get_default()
		context: GdkX11.X11AppLaunchContext = display.get_app_launch_context()
		context.setenv(DESKTOP_STARTUP_ID, context.get_startup_notify_id(app_info, []))
		context.set_timestamp(timestamp)
		context.set_desktop(desktop)
		context.set_screen(display.get_default_screen())
		app_info.launch_uris_as_manager([], context, SPAWN_FLAGS, USER_SETUP, USER_SETUP_DATA, None)
	except GLib.GError as exc:
		messages.add(Message('Error launching ' + str(app_info), 'error'))


def pid_callback(app_info: Gio.DesktopAppInfo, pid: int):
	print('Launched application pid: {}'.format(pid))


def load():
	for app_files_glob in APPS_GLOB:
		for file_path in glob.glob(app_files_glob):
			try:
				desktop_entry = xdg.DesktopEntry.DesktopEntry(file_path)
				if not desktop_entry.getExec():
					continue
				name = desktop_entry.getName().strip()
				name = name.replace('\xad', '')
				NAME_MAP[name] = desktop_entry
				LOCATION_MAP[name] = file_path
			except (xdg.Exceptions.ParsingError, TypeError) as e:
				print('Cant read a DesktopEntry from: {} Error: {}'.format(file_path, e), file=sys.stderr)
				continue


def reload():
	NAME_MAP.clear()
	load()


def complete(c_in: UserEvent):
	name_filter = c_in.vim_command_parameter
	lower = name_filter.lower()
	matches = filter(lambda x: lower in x.lower(), NAME_MAP.keys())
	matches = filter(lambda x: lower != x.lower(), matches)
	return sorted(list(set(matches)), key=str.lower)


# https://lazka.github.io/pgi-docs/GdkX11-3.0/classes/X11AppLaunchContext.html
# https://lazka.github.io/pgi-docs/Gio-2.0/classes/DesktopAppInfo.html
def info_for(name: str) -> Gio.DesktopAppInfo:

	if name not in NAME_MAP.keys():
		messages.add(Message('No matching application for ' + name, 'error'))
		return None

	if not name or not name.strip() or name not in NAME_MAP.keys():
		messages.add(Message('Missing application name', 'error'))
		return None

	return Gio.DesktopAppInfo.new_from_filename(LOCATION_MAP[name])
