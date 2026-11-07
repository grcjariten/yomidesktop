// SPDX-License-Identifier: GPL-3.0-or-later
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <uiautomation.h>
#include <oleauto.h>
#include <atomic>
#include <thread>
#include <string>
#include <sstream>
#include <iomanip>
#include <iostream>
#include <vector>
#include <cwctype>

template<class T> struct Com {
 T* p=nullptr;~Com(){if(p)p->Release();}T** out(){return &p;}T* operator->(){return p;}operator bool()const{return p!=nullptr;}
};
struct Box{double x=0,y=0,w=0,h=0;bool valid=false;};
static std::atomic<ULONGLONG> deadline{0};
static Box hit(IUIAutomationTextRange* range,POINT point){
 SAFEARRAY* values=nullptr;Box result;
 if(FAILED(range->GetBoundingRectangles(&values))||!values)return result;
 LONG low=0,high=-1;SafeArrayGetLBound(values,1,&low);SafeArrayGetUBound(values,1,&high);double* data=nullptr;
 if(SUCCEEDED(SafeArrayAccessData(values,(void**)&data))){
  for(LONG i=0;i+3<=high-low;i+=4)if(data[i+2]>0&&data[i+3]>0&&point.x>=data[i]&&point.x<data[i]+data[i+2]&&point.y>=data[i+1]&&point.y<data[i+1]+data[i+3]){result={data[i],data[i+1],data[i+2],data[i+3],true};break;}
  SafeArrayUnaccessData(values);
 }SafeArrayDestroy(values);return result;
}
static std::wstring text(IUIAutomationTextRange* range,int maxLength){
 BSTR value=nullptr;if(FAILED(range->GetText(maxLength,&value)))return L"";
 std::wstring result(value?value:L"",value?SysStringLen(value):0);SysFreeString(value);return result;
}
static std::string jsonQuote(const std::wstring& value){
 std::ostringstream out;out<<'"';
 for(wchar_t c:value){if(c=='"')out<<"\\\"";else if(c=='\\')out<<"\\\\";else if(c>=32&&c<127)out<<(char)c;else out<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<(unsigned short)c<<std::dec;}
 out<<'"';return out.str();
}
static std::string readPattern(IUIAutomationTextPattern* pattern,POINT point,int extent){
 Com<IUIAutomationTextRange> origin;if(FAILED(pattern->RangeFromPoint(point,origin.out()))||!origin)return "null";
 Com<IUIAutomationTextRange> character;origin->Clone(character.out());if(!character)return "null";int moved=0;
 character->MoveEndpointByUnit(TextPatternRangeEndpoint_End,TextUnit_Character,1,&moved);Box box=hit(character.p,point);
 if(!box.valid){character.p->Release();character.p=nullptr;origin->Clone(character.out());if(!character)return "null";character->MoveEndpointByUnit(TextPatternRangeEndpoint_Start,TextUnit_Character,-1,&moved);box=hit(character.p,point);}
 if(!box.valid)return "null";
 Com<IUIAutomationTextRange> before,after;character->Clone(before.out());character->Clone(after.out());if(!before||!after)return "null";
 before->MoveEndpointByRange(TextPatternRangeEndpoint_End,character.p,TextPatternRangeEndpoint_Start);
 before->MoveEndpointByUnit(TextPatternRangeEndpoint_Start,TextUnit_Character,-extent,&moved);
 after->MoveEndpointByUnit(TextPatternRangeEndpoint_End,TextUnit_Character,extent,&moved);
 auto left=text(before.p,extent*4+16),right=text(after.p,extent*4+16);
 if(right.empty()||iswspace(right[0]))return "null";
 std::ostringstream out;out<<"{\"text\":"<<jsonQuote(left+right)<<",\"offset\":"<<left.size()<<",\"query\":"<<jsonQuote(right)<<",\"rect\":{\"x\":"<<box.x<<",\"y\":"<<box.y<<",\"width\":"<<box.w<<",\"height\":"<<box.h<<"}}";return out.str();
}
static std::string readElement(IUIAutomationElement* element,POINT point,int extent){
 BOOL password=FALSE;element->get_CurrentIsPassword(&password);if(password)return "null";
 BSTR framework=nullptr;element->get_CurrentFrameworkId(&framework);bool wpf=framework&&wcscmp(framework,L"WPF")==0;SysFreeString(framework);
 if(wpf)return "null"; // The primary reader handles the legacy WPF DPI correction.
 Com<IUIAutomationTextPattern> pattern;
 if(SUCCEEDED(element->GetCurrentPatternAs(UIA_TextPatternId,IID_IUIAutomationTextPattern,(void**)pattern.out()))&&pattern){auto result=readPattern(pattern.p,point,extent);if(result!="null")return result;}
 Com<IUIAutomationTextChildPattern> child;
 if(SUCCEEDED(element->GetCurrentPatternAs(UIA_TextChildPatternId,IID_IUIAutomationTextChildPattern,(void**)child.out()))&&child){
  Com<IUIAutomationElement> container;child->get_TextContainer(container.out());Com<IUIAutomationTextPattern> textPattern;
  if(container&&SUCCEEDED(container->GetCurrentPatternAs(UIA_TextPatternId,IID_IUIAutomationTextPattern,(void**)textPattern.out()))&&textPattern)return readPattern(textPattern.p,point,extent);
 }return "null";
}
static bool contains(IUIAutomationElement* element,POINT point){RECT r{};return SUCCEEDED(element->get_CurrentBoundingRectangle(&r))&&point.x>=r.left&&point.x<r.right&&point.y>=r.top&&point.y<r.bottom;}
static std::string read(IUIAutomation* uia,int x,int y,int extent,HWND window,bool fromWindow){
 POINT point{x,y};if(!IsWindow(window)||(!fromWindow&&GetAncestor(WindowFromPoint(point),GA_ROOT)!=window))return "null";
 Com<IUIAutomationElement> element;HRESULT hr=fromWindow?uia->ElementFromHandle(window,element.out()):uia->ElementFromPoint(point,element.out());
 if(FAILED(hr)||!element)return "null";
 Com<IUIAutomationTreeWalker> walker;uia->get_RawViewWalker(walker.out());if(!walker)return "null";
 std::vector<IUIAutomationElement*> path;element.p->AddRef();path.push_back(element.p);
 for(int i=0;i<31;i++){BOOL secret=FALSE;path.back()->get_CurrentIsPassword(&secret);if(secret){for(auto e:path)e->Release();return "null";}IUIAutomationElement* parent=nullptr;if(FAILED(walker->GetParentElement(path.back(),&parent))||!parent)break;path.push_back(parent);}
 std::string result="null";
 for(auto e:path){result=readElement(e,point,extent);if(result!="null")break;}
 for(auto e:path)e->Release();if(result!="null")return result;
 // Some providers return a containing pane rather than its text child.
 std::vector<IUIAutomationElement*> stack;element.p->AddRef();stack.push_back(element.p);int inspected=0;
 while(!stack.empty()&&inspected++<120){
  auto e=stack.back();stack.pop_back();BOOL secret=FALSE;e->get_CurrentIsPassword(&secret);
  if(!secret){result=readElement(e,point,extent);if(result!="null"){e->Release();break;}
   IUIAutomationElement* child=nullptr;walker->GetFirstChildElement(e,&child);int siblings=0;
   while(child&&siblings++<160){IUIAutomationElement* next=nullptr;walker->GetNextSiblingElement(child,&next);if(contains(child,point))stack.push_back(child);else child->Release();child=next;}if(child)child->Release();
  }e->Release();
 }for(auto e:stack)e->Release();return result;
}
int main(int argc,char**argv){
 SetProcessDpiAwarenessContext((DPI_AWARENESS_CONTEXT)-4);CoInitializeEx(nullptr,COINIT_MULTITHREADED);
 std::thread([]{for(;;){auto end=deadline.load();if(end&&GetTickCount64()>end)ExitProcess(124);Sleep(50);}}).detach();
 {Com<IUIAutomation> uia;if(FAILED(CoCreateInstance(CLSID_CUIAutomation,nullptr,CLSCTX_INPROC_SERVER,IID_IUIAutomation,(void**)uia.out())))return 1;
  if(argc==6&&(std::string(argv[1])=="--window"||std::string(argv[1])=="--point")){deadline=GetTickCount64()+1400;std::cout<<read(uia.p,atoi(argv[3]),atoi(argv[4]),atoi(argv[5]),(HWND)_strtoui64(argv[2],nullptr,10),std::string(argv[1])=="--window")<<std::endl;deadline=0;}
  else{int mode,x,y,extent;unsigned long long handle;while(std::cin>>mode>>x>>y>>extent>>handle){deadline=GetTickCount64()+1400;std::cout<<read(uia.p,x,y,extent,(HWND)handle,mode==1)<<std::endl;deadline=0;}}
 }CoUninitialize();return 0;
}

