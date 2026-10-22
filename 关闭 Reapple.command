#!/bin/bash
set -u
CLI="$HOME/.reapple/runtime/bin/reapple"
if [ -f "$CLI" ]; then bash "$CLI" off; result=$?; else echo "未安装 Reapple，请先双击安装入口。"; result=1; fi
printf "\n按回车关闭此窗口。"; read -r _
exit "$result"
