// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only IAccessible2 fallback. ABI: Linux Foundation AccessibleText.idl.
using System;
using System.Runtime.InteropServices;
using Accessibility;
using System.Collections.Generic;
using System.Diagnostics;

[ComImport,Guid("24FD2FFB-3AAD-4A08-8335-A3AD89C0FB4B"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAccessibleText {
    [PreserveSig]int addSelection(int start,int end);
    [PreserveSig]int get_attributes(int offset,out int start,out int end,[MarshalAs(UnmanagedType.BStr)]out string value);
    [PreserveSig]int get_caretOffset(out int offset);
    [PreserveSig]int get_characterExtents(int offset,int coordinateType,out int x,out int y,out int width,out int height);
    [PreserveSig]int get_nSelections(out int count);
    [PreserveSig]int get_offsetAtPoint(int x,int y,int coordinateType,out int offset);
    [PreserveSig]int get_selection(int index,out int start,out int end);
    [PreserveSig]int get_text(int start,int end,[MarshalAs(UnmanagedType.BStr)]out string value);
    [PreserveSig]int get_textBeforeOffset(int offset,int boundary,out int start,out int end,[MarshalAs(UnmanagedType.BStr)]out string value);
    [PreserveSig]int get_textAfterOffset(int offset,int boundary,out int start,out int end,[MarshalAs(UnmanagedType.BStr)]out string value);
    [PreserveSig]int get_textAtOffset(int offset,int boundary,out int start,out int end,[MarshalAs(UnmanagedType.BStr)]out string value);
    [PreserveSig]int removeSelection(int index);
    [PreserveSig]int setCaretOffset(int offset);
    [PreserveSig]int setSelection(int index,int start,int end);
    [PreserveSig]int get_nCharacters(out int count);
}
[ComImport,Guid("6D5140C1-7436-11CE-8034-00AA006009FA"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAccessibleServiceProvider {
    [PreserveSig]int QueryService(ref Guid service,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out object value);
}
public static class AccessibleTextReader {
    static void Trace(string value){if(Environment.GetEnvironmentVariable("YOMIDESKTOP_READER_TRACE")=="1")Console.Error.WriteLine("IA2 "+value);}
    [StructLayout(LayoutKind.Sequential)]struct POINT{public int x,y;}
    [DllImport("oleacc.dll")]static extern int AccessibleObjectFromPoint(POINT point,[MarshalAs(UnmanagedType.Interface)]out IAccessible accessible,[MarshalAs(UnmanagedType.Struct)]out object child);
    [DllImport("oleacc.dll")]static extern int AccessibleObjectFromWindow(IntPtr window,uint objectId,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out IAccessible accessible);
    [DllImport("oleacc.dll")]static extern int AccessibleChildren(IAccessible accessible,int start,int count,[Out,MarshalAs(UnmanagedType.LPArray,SizeParamIndex=2)]object[] children,out int obtained);
    public sealed class Hit {public string text;public int offset,x,y,width,height;}
    static bool Contains(IAccessible accessible,object child,int x,int y){int left,top,width,height;accessible.accLocation(out left,out top,out width,out height,child);Trace("bounds "+left+","+top+" "+width+"x"+height+" point "+x+","+y);return width>0&&height>0&&x>=left&&x<left+width&&y>=top&&y<top+height;}
    static IEnumerable<IAccessible> AtPoint(IAccessible root,int x,int y){
        var stack=new Stack<IAccessible>();stack.Push(root);int inspected=0;var clock=Stopwatch.StartNew();
        while(stack.Count>0&&inspected++<160&&clock.ElapsedMilliseconds<1200){
            var item=stack.Pop();yield return item;
            int count;try{count=Math.Min(item.accChildCount,160-inspected);}catch(COMException){continue;}
            Trace("children "+count);if(count<1)continue;
            var children=new object[count];int obtained;if(AccessibleChildren(item,0,count,children,out obtained)<0)continue;
            for(int i=0;i<obtained;i++){
                try{var value=children[i];var child=value as IAccessible;
                    if(child==null&&value is int)child=item.get_accChild(value) as IAccessible;
                    if(child!=null&&Contains(child,0,x,y)&&(Convert.ToInt32(child.get_accState(0))&0x20000000)==0)stack.Push(child);
                }catch(COMException){}catch(InvalidCastException){}
            }
        }
    }
    static IAccessibleText TextInterface(object accessible){
        var direct=accessible as IAccessibleText;if(direct!=null)return direct;
        var services=accessible as IAccessibleServiceProvider;if(services==null){Trace("no service provider");return null;}
        var service=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
        var iid=new Guid("24FD2FFB-3AAD-4A08-8335-A3AD89C0FB4B");object value;
        int hr=services.QueryService(ref service,ref iid,out value);Trace("text service "+hr.ToString("X8"));
        if(hr>=0&&value!=null)return value as IAccessibleText;
        // Gecko and other providers publish the IA2 object as a service first.
        iid=new Guid("E89F726E-C4F4-4C19-BB19-B647D7FA8478");
        hr=services.QueryService(ref service,ref iid,out value);Trace("IA2 service "+hr.ToString("X8"));
        if(hr>=0&&value!=null)return value as IAccessibleText;
        return null;
    }
    public static Hit Read(int x,int y,int extent,IntPtr window=default(IntPtr)){
        try{
            IAccessible accessible;object child;
            if(window==IntPtr.Zero){if(AccessibleObjectFromPoint(new POINT{x=x,y=y},out accessible,out child)<0||accessible==null)return null;}
            else{var iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");if(AccessibleObjectFromWindow(window,unchecked((uint)-4),ref iid,out accessible)<0||accessible==null)return null;child=0;}
            if(child is int&&(int)child!=0){
                if((Convert.ToInt32(accessible.get_accState(child))&0x20000000)!=0)return null;
                try{var nested=accessible.get_accChild(child) as IAccessible;if(nested!=null)accessible=nested;}catch(COMException){}
            }
            foreach(var item in AtPoint(accessible,x,y)){
                Trace("role "+item.get_accRole(0));
                if((Convert.ToInt32(item.get_accState(0))&0x20000000)!=0)return null;
                IAccessibleText text=null;
                try{text=TextInterface(item);}catch(COMException){continue;}
                if(text!=null){
                    int offset,count,bx,by,bw,bh;
                    int pointHr=text.get_offsetAtPoint(x,y,0,out offset);Trace("point "+pointHr.ToString("X8")+" offset "+offset);
                    if(pointHr>=0&&offset>=0&&text.get_nCharacters(out count)>=0&&offset<count&&
                       text.get_characterExtents(offset,0,out bx,out by,out bw,out bh)>=0&&bw>0&&bh>0&&x>=bx&&x<bx+bw&&y>=by&&y<by+bh){
                        int start=Math.Max(0,offset-extent),end=Math.Min(count,offset+extent+2);string content;
                        if(text.get_text(start,end,out content)>=0&&!String.IsNullOrEmpty(content)){
                            if(start>0&&Char.IsLowSurrogate(content[0])){start--;if(text.get_text(start,end,out content)<0||String.IsNullOrEmpty(content))return null;}
                            if(end<count&&Char.IsHighSurrogate(content[content.Length-1])){end++;if(text.get_text(start,end,out content)<0||String.IsNullOrEmpty(content))return null;}
                            int relative=offset-start;
                            if(relative>=content.Length)return null;
                            if(Char.IsLowSurrogate(content[relative])&&relative>0&&Char.IsHighSurrogate(content[relative-1]))relative--;
                            if(!Char.IsWhiteSpace(content[relative]))return new Hit{text=content,offset=relative,x=bx,y=by,width=bw,height=bh};
                        }
                    }
                }
            }
        }catch(COMException e){Trace("COM "+e.ErrorCode.ToString("X8"));}catch(InvalidCastException){}catch(ArgumentException){}catch(NotImplementedException){}
        return null;
    }
}
