// SPDX-License-Identifier: GPL-3.0-or-later
// Direct subtitle text bridge. No screen capture, OCR or clipboard access.
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
static int poll(struct pollfd *fds,unsigned nfds,int timeout){return WSAPoll(fds,nfds,timeout);}
#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_filter.h>
#include <vlc_subpicture.h>
#include <vlc_text_style.h>
#include <vlc_codec.h>
#include <vlc_modules.h>
#include <vlc_block.h>
#include <ctype.h>

typedef struct {
    LONG refs;
    SOCKET socket;
    struct sockaddr_in server;
    DWORD ack_at;
    char token[129];
    char font[256];
    int fontsize,relfontsize,color,bold;
} bridge_t;
struct filter_sys_t {bridge_t *bridge;};
typedef struct {
    subpicture_updater_t original;
    subpicture_region_t *saved;
    bridge_t *bridge;
    bool ass;
} wrapper_t;
static void ASSUpdate(subpicture_t *,const video_format_t *,const video_format_t *,vlc_tick_t);
typedef struct {char text[60000];size_t pos;bool valid;} buffer_t;
static void debug_test(const char *name,int value){const char *p=getenv("YOMIDESKTOP_TEST_LOG");if(!p)return;FILE *f=fopen(p,"a");if(f){fprintf(f,"%s %d\n",name,value);fclose(f);}}
static void core_free(void *p){if(p){typedef void (__cdecl *free_fn)(void*);free_fn f=(free_fn)GetProcAddress(GetModuleHandleA("msvcrt.dll"),"free");if(f)f(p);}}
static char *core_strdup(const char *p){typedef char *(__cdecl *fn)(const char*);fn f=(fn)GetProcAddress(GetModuleHandleA("msvcrt.dll"),"_strdup");return f?f(p):NULL;}
static void writef(buffer_t *b,const char *fmt,...) {
    if(!b->valid)return;
    va_list ap;va_start(ap,fmt);int n=vsnprintf(b->text+b->pos,sizeof(b->text)-b->pos,fmt,ap);va_end(ap);
    if(n<0||(size_t)n>=sizeof(b->text)-b->pos){b->valid=false;return;}b->pos+=n;
}
static void writes(buffer_t *b,const char *text) {
    writef(b,"\"");if(text)for(const unsigned char *p=(const unsigned char*)text;*p;p++) {
        switch(*p){case '"':writef(b,"\\\"");break;case '\\':writef(b,"\\\\");break;case '\n':writef(b,"\\n");break;case '\r':writef(b,"\\r");break;case '\t':writef(b,"\\t");break;default:if(*p<32)writef(b,"\\u%04x",*p);else writef(b,"%c",*p);}
    }writef(b,"\"");
}
static void release_bridge(bridge_t *b) {if(InterlockedDecrement(&b->refs)==0){closesocket(b->socket);free(b);WSACleanup();}}
static subpicture_region_t *copy_regions(subpicture_region_t *r) {
    subpicture_region_t *head=NULL,**tail=&head;
    for(;r;r=r->p_next){subpicture_region_t *copy=subpicture_region_Copy(r);if(!copy){subpicture_region_ChainDelete(head);return NULL;}copy->p_next=NULL;*tail=copy;tail=&copy->p_next;}
    return head;
}
static bool connected(bridge_t *b) {
    char incoming[180];struct sockaddr_in from;int len=sizeof(from),n;
    while((n=recvfrom(b->socket,incoming,sizeof(incoming)-1,0,(struct sockaddr*)&from,&len))>0){incoming[n]=0;
        if(from.sin_addr.s_addr==htonl(INADDR_LOOPBACK)&&from.sin_port==b->server.sin_port&&strncmp(incoming,"ack:",4)==0&&strcmp(incoming+4,b->token)==0)b->ack_at=GetTickCount();
    }
    return b->ack_at!=0&&(DWORD)(GetTickCount()-b->ack_at)<350;
}
static void publish(subpicture_t *sub,wrapper_t *wrap,const video_format_t *dst,vlc_tick_t tick) {
    bridge_t *b=wrap->bridge;buffer_t json={.pos=0,.valid=true};bool active=connected(b);int regions=0;
    writef(&json,"{\"protocol\":1,\"token\":");writes(&json,b->token);
    writef(&json,",\"pid\":%lu,\"id\":%lld,\"tick\":%lld,\"start\":%lld,\"stop\":%lld,\"width\":%u,\"height\":%u,\"originalWidth\":%d,\"originalHeight\":%d,\"absolute\":%s,\"suppressed\":%s,\"font\":",GetCurrentProcessId(),(long long)sub->i_order,(long long)tick,(long long)sub->i_start,(long long)sub->i_stop,dst->i_visible_width,dst->i_visible_height,sub->i_original_picture_width,sub->i_original_picture_height,sub->b_absolute?"true":"false",active?"true":"false");
    writes(&json,b->font);writef(&json,",\"fontSize\":%d,\"relativeSize\":%d,\"color\":%d,\"bold\":%s,\"regions\":[",b->fontsize,b->relfontsize,b->color,b->bold?"true":"false");
    for(subpicture_region_t *r=sub->p_region;r;r=r->p_next){
        if(!r->p_text)continue;
        if(regions++)writef(&json,",");
        writef(&json,"{\"x\":%d,\"y\":%d,\"align\":%d,\"absolute\":%s,\"width\":%u,\"height\":%u,\"textAlign\":%d,\"maxWidth\":%d,\"segments\":[",r->i_x,r->i_y,r->i_align,(sub->b_absolute&&!wrap->ass)?"true":"false",r->fmt.i_visible_width,r->fmt.i_visible_height,r->i_text_align,r->i_max_width);
        int segments=0;
        for(text_segment_t *s=r->p_text;s;s=s->p_next){if(!s->psz_text)continue;if(segments++)writef(&json,",");writef(&json,"{\"text\":");writes(&json,s->psz_text);
            text_style_t *t=s->style;if(t){writef(&json,",\"style\":{\"font\":");writes(&json,t->psz_fontname);writef(&json,",\"features\":%u,\"flags\":%u,\"size\":%d,\"relativeSize\":%.6f,\"color\":%d,\"alpha\":%u,\"spacing\":%d}",t->i_features,t->i_style_flags,t->i_font_size,t->f_font_relsize,t->i_font_color,t->i_font_alpha,t->i_spacing);}
            writef(&json,"}");
        }writef(&json,"]}");
    }writef(&json,"]}");
    if(!json.valid||!regions)return;
    // The original renderer stays visible until a live local companion acknowledges.
    int sent=sendto(b->socket,json.text,(int)json.pos,0,(struct sockaddr*)&b->server,sizeof(b->server));
    if(active&&sent==(int)json.pos)for(subpicture_region_t *r=sub->p_region;r;r=r->p_next)r->i_alpha=0;
}
static int Validate(subpicture_t *sub,bool src_changed,const video_format_t *src,bool dst_changed,const video_format_t *dst,vlc_tick_t tick) {
    // Forward validation: renderers such as libass acquire their render lock here.
    subpicture_updater_t outer=sub->updater;wrapper_t *saved=(wrapper_t*)outer.p_sys;sub->updater=saved->original;
    if(sub->updater.pf_validate)sub->updater.pf_validate(sub,true,src,true,dst,tick);
    saved->original=sub->updater;sub->updater=outer;(void)src_changed;(void)dst_changed;return VLC_EGENERIC;
}
static void Update(subpicture_t *sub,const video_format_t *src,const video_format_t *dst,vlc_tick_t tick) {
    subpicture_updater_t outer=sub->updater;wrapper_t *wrap=(wrapper_t*)outer.p_sys;
    sub->updater=wrap->original;
    if(sub->updater.pf_update)sub->updater.pf_update(sub,src,dst,tick);
    else sub->p_region=copy_regions(wrap->saved);
    wrap->original=sub->updater;sub->updater=outer;
    publish(sub,wrap,dst,tick);
}
static void DestroySubtitle(subpicture_t *sub) {
    wrapper_t *wrap=(wrapper_t*)sub->updater.p_sys;
    char message[400];int count=snprintf(message,sizeof(message),"{\"protocol\":1,\"token\":\"%s\",\"pid\":%lu,\"id\":%lld,\"clear\":true}",wrap->bridge->token,GetCurrentProcessId(),(long long)sub->i_order);
    sendto(wrap->bridge->socket,message,count,0,(struct sockaddr*)&wrap->bridge->server,sizeof(wrap->bridge->server));
    sub->updater=wrap->original;if(sub->updater.pf_destroy)sub->updater.pf_destroy(sub);
    subpicture_region_ChainDelete(wrap->saved);release_bridge(wrap->bridge);free(wrap);
}
static subpicture_t *Filter(filter_t *filter,subpicture_t *sub) {
    debug_test("filter",sub?sub->b_subtitle:-1);
    if(!sub||!sub->b_subtitle)return sub;
    wrapper_t *wrap=calloc(1,sizeof(*wrap));if(!wrap)return sub;
    wrap->original=sub->updater;wrap->bridge=filter->p_sys->bridge;wrap->ass=sub->updater.pf_update==ASSUpdate;
    if(!wrap->original.pf_update){wrap->saved=copy_regions(sub->p_region);if(sub->p_region&&!wrap->saved){free(wrap);return sub;}}
    InterlockedIncrement(&wrap->bridge->refs);
    sub->updater=(subpicture_updater_t){.pf_validate=Validate,.pf_update=Update,.pf_destroy=DestroySubtitle,.p_sys=(subpicture_updater_sys_t*)wrap};
    return sub;
}
static int Open(vlc_object_t *object) {
    filter_t *filter=(filter_t*)object;filter_sys_t *sys=calloc(1,sizeof(*sys));bridge_t *b=calloc(1,sizeof(*b));
    if(!sys||!b){free(sys);free(b);return VLC_ENOMEM;}
    char *token=var_InheritString(filter,"yomidesktop-token");
    if(!token||strlen(token)<32||strlen(token)>128){core_free(token);free(sys);free(b);return VLC_EGENERIC;}
    strcpy(b->token,token);core_free(token);b->refs=1;
    WSADATA wsa;if(WSAStartup(MAKEWORD(2,2),&wsa)){free(sys);free(b);return VLC_EGENERIC;}
    b->socket=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);if(b->socket==INVALID_SOCKET){WSACleanup();free(sys);free(b);return VLC_EGENERIC;}
    u_long nonblocking=1;ioctlsocket(b->socket,FIONBIO,&nonblocking);
    b->server.sin_family=AF_INET;b->server.sin_port=htons(19634);b->server.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    char *font=var_InheritString(filter,"freetype-font");snprintf(b->font,sizeof(b->font),"%s",font?font:"Segoe UI");core_free(font);
    b->fontsize=(int)var_InheritInteger(filter,"freetype-fontsize");b->relfontsize=(int)var_InheritInteger(filter,"freetype-rel-fontsize");b->color=(int)var_InheritInteger(filter,"freetype-color");b->bold=var_InheritBool(filter,"freetype-bold");
    sys->bridge=b;filter->p_sys=sys;filter->pf_sub_filter=Filter;return VLC_SUCCESS;
}
static void Close(vlc_object_t *object){filter_t *filter=(filter_t*)object;release_bridge(filter->p_sys->bridge);free(filter->p_sys);}

/* ASS decoder monitor. Original libass handles normal playback; a text-only region
 * retains the original decoded characters for the live dictionary surface. */
typedef struct {
    module_t *inner;
    decoder_sys_t *inner_sys;
    int (*decode)(decoder_t*,block_t*);
    void (*flush)(decoder_t*);
    int (*queue)(decoder_t*,subpicture_t*);
    char *header;
    const char *current;
} ass_decoder_t;
typedef struct {subpicture_updater_t original;char *packet;char *header;} ass_subtitle_t;
static __thread ass_decoder_t *decoding_ass;
static char *copy_string(const char *p,size_t n){char *s=malloc(n+1);if(s){memcpy(s,p,n);s[n]=0;}return s;}
static char *field(char *line,int index){char *p=line;while(index--&&p){p=strchr(p,',');if(p)p++;}if(!p)return NULL;char *end=strchr(p,',');if(end)*end=0;return p;}
static int ass_color(const char *s){if(!s)return 0xffffff;while(*s=='&'||*s=='H'||*s=='h')s++;unsigned v=(unsigned)strtoul(s,NULL,16);return ((v&255)<<16)|(v&0xff00)|((v>>16)&255);}
static void AppendASS(subpicture_t *sub,const video_format_t *dst,ass_subtitle_t *saved){
    const char *text=saved->packet;if(!text)return;
    const char *parts[9]={text};int count=1;for(const char *p=text;*p&&count<9;p++)if(*p==',')parts[count++]=p+1;
    if(count<9)return;text=parts[8];
    char styleName[180]="Default";size_t sn=(size_t)(parts[3]-parts[2]-1);if(sn<sizeof(styleName)){memcpy(styleName,parts[2],sn);styleName[sn]=0;}
    int resx=384,resy=288,align=2,margin=10,left=10,right=10,flags=0,color=0xffffff;double fontsize=20;char font[256]="Arial";
    if(saved->header){
        const char *p=strstr(saved->header,"PlayResX:");if(p)resx=atoi(p+9);p=strstr(saved->header,"PlayResY:");if(p)resy=atoi(p+9);if(resx<=0)resx=384;if(resy<=0)resy=288;
        const char *line=saved->header;while((line=strstr(line,"Style:"))){line+=6;while(*line==' ')line++;const char *end=strpbrk(line,"\r\n");size_t len=end?(size_t)(end-line):strlen(line);
            if(strncmp(line,styleName,strlen(styleName))==0&&line[strlen(styleName)]==','){
                char *style=copy_string(line,len),*v;
                // Read from the end because field() terminates its selected value.
                if((v=field(style,21)))margin=atoi(v);free(style);style=copy_string(line,len);
                if((v=field(style,20)))right=atoi(v);free(style);style=copy_string(line,len);
                if((v=field(style,19)))left=atoi(v);free(style);style=copy_string(line,len);
                if((v=field(style,18)))align=atoi(v);free(style);style=copy_string(line,len);
                if((v=field(style,10))&&atoi(v))flags|=STYLE_STRIKEOUT;free(style);style=copy_string(line,len);
                if((v=field(style,9))&&atoi(v))flags|=STYLE_UNDERLINE;free(style);style=copy_string(line,len);
                if((v=field(style,8))&&atoi(v))flags|=STYLE_ITALIC;free(style);style=copy_string(line,len);
                if((v=field(style,7))&&atoi(v))flags|=STYLE_BOLD;free(style);style=copy_string(line,len);
                if((v=field(style,3)))color=ass_color(v);free(style);style=copy_string(line,len);
                if((v=field(style,2)))fontsize=atof(v);free(style);style=copy_string(line,len);
                if((v=field(style,1)))snprintf(font,sizeof(font),"%s",v);free(style);break;
            }
        }
    }
    buffer_t plain={.pos=0,.valid=true};bool drawing=false;double posx=-1,posy=-1;
    for(const char *p=text;*p;){
        if(*p=='{'&&p[1]=='\\'){
            const char *end=strchr(p,'}');if(!end)break;
            for(const char *tag=p+1;tag<end;tag++)if(*tag=='\\'){
                if(tag[1]=='a'&&tag[2]=='n'&&isdigit((unsigned char)tag[3]))align=atoi(tag+3);
                else if(tag[1]=='p'&&isdigit((unsigned char)tag[2]))drawing=atoi(tag+2)!=0;
                else if(strncmp(tag,"\\pos(",5)==0)sscanf(tag+5,"%lf,%lf",&posx,&posy);
                else if(strncmp(tag,"\\fs",3)==0&&isdigit((unsigned char)tag[3]))fontsize=atof(tag+3);
            }p=end+1;continue;
        }
        if(*p=='\\'&&(p[1]=='N'||p[1]=='n'||p[1]=='h')){if(!drawing)writef(&plain,"%c",p[1]=='h'?' ':'\n');p+=2;continue;}
        if(!drawing)writef(&plain,"%c",*p);p++;
    }
    if(!plain.valid||!plain.pos)return;
    video_format_t format;video_format_Init(&format,VLC_CODEC_TEXT);subpicture_region_t *r=subpicture_region_New(&format);video_format_Clean(&format);if(!r)return;
    r->p_text=text_segment_New(plain.text);if(!r->p_text){subpicture_region_Delete(r);return;}
    text_style_t *style=text_style_Create(STYLE_NO_DEFAULTS);if(style){style->psz_fontname=core_strdup(font);style->f_font_relsize=(float)(fontsize*100.0/resy);style->i_font_color=color;style->i_font_alpha=255;style->i_style_flags=flags;style->i_features=STYLE_HAS_FONT_COLOR|STYLE_HAS_FONT_ALPHA|STYLE_HAS_FLAGS;r->p_text->style=style;}
    int col=(align-1)%3,row=(align-1)/3;r->i_align=(col==0?SUBPICTURE_ALIGN_LEFT:col==2?SUBPICTURE_ALIGN_RIGHT:0)|(row==0?SUBPICTURE_ALIGN_BOTTOM:row==2?SUBPICTURE_ALIGN_TOP:0);
    r->i_x=(int)((col==0?left:col==2?right:0)*(double)dst->i_visible_width/resx);r->i_y=(int)(margin*(double)dst->i_visible_height/resy);
    if(posx>=0&&posy>=0){r->i_align=0;r->i_x=(int)((posx/resx-.5)*dst->i_visible_width);r->i_y=(int)((posy/resy-.5)*dst->i_visible_height);}
    r->i_alpha=0;subpicture_region_t **tail=&sub->p_region;while(*tail)tail=&(*tail)->p_next;*tail=r;
}
static void ASSUpdate(subpicture_t *sub,const video_format_t *src,const video_format_t *dst,vlc_tick_t tick){
    debug_test("ass-update",1);
    subpicture_updater_t outer=sub->updater;ass_subtitle_t *saved=(ass_subtitle_t*)outer.p_sys;sub->updater=saved->original;
    if(sub->updater.pf_update)sub->updater.pf_update(sub,src,dst,tick);saved->original=sub->updater;sub->updater=outer;AppendASS(sub,dst,saved);
}
static int ASSValidate(subpicture_t *sub,bool sc,const video_format_t *src,bool dc,const video_format_t *dst,vlc_tick_t tick){subpicture_updater_t outer=sub->updater;ass_subtitle_t *saved=(ass_subtitle_t*)outer.p_sys;sub->updater=saved->original;int r=sub->updater.pf_validate?sub->updater.pf_validate(sub,true,src,true,dst,tick):VLC_EGENERIC;saved->original=sub->updater;sub->updater=outer;(void)sc;(void)dc;return r;}
static void ASSDestroy(subpicture_t *sub){ass_subtitle_t *saved=(ass_subtitle_t*)sub->updater.p_sys;sub->updater=saved->original;if(sub->updater.pf_destroy)sub->updater.pf_destroy(sub);free(saved->packet);free(saved->header);free(saved);}
static int ASSQueue(decoder_t *decoder,subpicture_t *sub){ass_decoder_t *sys=decoding_ass;debug_test("ass-queue",sys&&sys->current?(int)strlen(sys->current):-1);if(!sys)return VLC_EGENERIC;
    if(sys->current){ass_subtitle_t *saved=calloc(1,sizeof(*saved));if(saved){saved->original=sub->updater;saved->packet=copy_string(sys->current,strlen(sys->current));saved->header=sys->header?copy_string(sys->header,strlen(sys->header)):NULL;sub->updater=(subpicture_updater_t){.pf_validate=ASSValidate,.pf_update=ASSUpdate,.pf_destroy=ASSDestroy,.p_sys=(subpicture_updater_sys_t*)saved};}}
    return sys->queue(decoder,sub);
}
static int ASSDecode(decoder_t *decoder,block_t *block){debug_test("ass-decode",block?(int)block->i_buffer:-1);ass_decoder_t *sys=(ass_decoder_t*)decoder->p_sys;char *text=block?copy_string((const char*)block->p_buffer,block->i_buffer):NULL;sys->current=text;decoding_ass=sys;sys->queue=decoder->pf_queue_sub;decoder->pf_queue_sub=ASSQueue;decoder->p_sys=sys->inner_sys;int r=sys->decode(decoder,block);sys->inner_sys=decoder->p_sys;decoder->p_sys=(decoder_sys_t*)sys;decoder->pf_queue_sub=sys->queue;decoding_ass=NULL;sys->current=NULL;free(text);return r;}
static void ASSFlush(decoder_t *decoder){ass_decoder_t *sys=(ass_decoder_t*)decoder->p_sys;decoder->p_sys=sys->inner_sys;if(sys->flush)sys->flush(decoder);sys->inner_sys=decoder->p_sys;decoder->p_sys=(decoder_sys_t*)sys;}
static int ASSOpen(vlc_object_t *object){decoder_t *decoder=(decoder_t*)object;if(decoder->fmt_in.i_codec!=VLC_CODEC_SSA)return VLC_EGENERIC;
    ass_decoder_t *sys=calloc(1,sizeof(*sys));if(!sys)return VLC_ENOMEM;
    sys->queue=decoder->pf_queue_sub;sys->inner=module_need(decoder,"spu decoder","libass",true);if(!sys->inner){free(sys);return VLC_EGENERIC;}
    sys->inner_sys=decoder->p_sys;sys->decode=decoder->pf_decode;sys->flush=decoder->pf_flush;
    if(decoder->fmt_in.i_extra>0)sys->header=copy_string(decoder->fmt_in.p_extra,decoder->fmt_in.i_extra);
    decoder->p_sys=(decoder_sys_t*)sys;decoder->pf_decode=ASSDecode;decoder->pf_flush=ASSFlush;decoder->pf_queue_sub=ASSQueue;return VLC_SUCCESS;
}
static void ASSClose(vlc_object_t *object){decoder_t *decoder=(decoder_t*)object;ass_decoder_t *sys=(ass_decoder_t*)decoder->p_sys;decoder->p_sys=sys->inner_sys;decoder->pf_queue_sub=sys->queue;module_unneed(decoder,sys->inner);free(sys->header);free(sys);}
vlc_module_begin()
    cannot_unload_broken_library()
    set_shortname("YomiDesktop")
    set_description("YomiDesktop direct subtitle text bridge")
    set_capability("sub filter",0)
    add_shortcut("yomidesktop")
    set_callbacks(Open,Close)
    add_string("yomidesktop-token","","Local companion token",NULL,true)
    add_submodule()
        set_shortname("YomiDesktop ASS")
        set_description("YomiDesktop direct ASS subtitle monitor")
        set_capability("spu decoder",1000)
        add_shortcut("yomi-ass")
        set_callbacks(ASSOpen,ASSClose)
vlc_module_end()
